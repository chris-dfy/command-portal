import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { RealtimeVoiceClient } from "../src/lib/realtime-voice-client.ts";

// The realtime voice cancellation state machine (barge-in cancel, benign
// cancellation-race settlement, stale-response filtering, queued creation)
// must never silently regress into a stuck session or duplicate answers.

const clients = [];

function makeClient() {
  const states = [];
  const errors = [];
  const transcripts = { user: [], assistant: [] };
  const audio = {
    muted: false,
    srcObject: null,
    pause() {},
    play() { return Promise.resolve(); },
  };
  const client = new RealtimeVoiceClient(audio, {
    onState: (state) => states.push(state),
    onAmplitude: () => {},
    onUserTranscript: (text) => transcripts.user.push(text),
    onAssistantTranscript: (text) => transcripts.assistant.push(text),
    onError: (message, code) => errors.push({ message, code }),
  });
  const sent = [];
  // Compile-time private fields are reachable at runtime; install a fake
  // open data channel so send() records outbound provider events.
  client.channel = {
    readyState: "open",
    send: (raw) => sent.push(JSON.parse(raw)),
    close() {},
  };
  const dispatch = (event) => client.handleEvent(JSON.stringify(event));
  clients.push(client);
  return { client, dispatch, sent, states, errors, transcripts };
}

afterEach(() => {
  // Clear any pending response-boundary timers so the test runner exits.
  for (const client of clients.splice(0)) client.stop();
});

test("barge-in cancels the active response by id and clears output audio", () => {
  const { dispatch, sent, states } = makeClient();
  dispatch({ type: "response.created", response: { id: "resp_1" } });
  dispatch({ type: "input_audio_buffer.speech_started" });

  assert.deepEqual(sent, [
    { type: "response.cancel", response_id: "resp_1" },
    { type: "output_audio_buffer.clear" },
  ]);
  assert.equal(states.at(-1), "interrupted");

  // While cancelling, a second speech_started must not send another cancel.
  dispatch({ type: "input_audio_buffer.speech_started" });
  assert.equal(sent.filter((e) => e.type === "response.cancel").length, 1);
});

test("benign cancellation-race error settles the cancel and fires the queued response.create", () => {
  const { dispatch, sent, states, errors } = makeClient();
  dispatch({ type: "response.created", response: { id: "resp_1" } });
  dispatch({ type: "input_audio_buffer.speech_started" });
  // Finalized transcript arrives while cancelling: creation must be queued.
  dispatch({ type: "conversation.item.input_audio_transcription.completed", transcript: "next question" });
  assert.equal(sent.filter((e) => e.type === "response.create").length, 0);

  // The response finished before response.cancel arrived: benign race.
  dispatch({ type: "error", error: { message: "Cancellation failed: no active response found" } });

  assert.equal(errors.length, 0, "benign cancellation race must not fail the session");
  assert.equal(sent.filter((e) => e.type === "response.create").length, 1);
  assert.equal(states.at(-1), "thinking");
});

test("non-benign errors still fail the session", () => {
  const { dispatch, errors, states } = makeClient();
  dispatch({ type: "error", error: { message: "provider exploded" } });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, "provider exploded");
  assert.equal(states.at(-1), "error");
});

test("delta and done events from a stale response id are ignored", () => {
  const { dispatch, states, transcripts } = makeClient();
  dispatch({ type: "response.created", response: { id: "resp_2" } });

  dispatch({ type: "response.output_audio_transcript.delta", response_id: "resp_1", delta: "stale " });
  dispatch({ type: "response.output_audio.delta", response_id: "resp_1" });
  assert.deepEqual(transcripts.assistant, []);
  assert.equal(states.includes("speaking"), false);

  // Stale response.done must not settle the active response.
  dispatch({ type: "response.done", response: { id: "resp_1" } });
  assert.notEqual(states.at(-1), "listening");

  // Active-response events still flow.
  dispatch({ type: "response.output_audio_transcript.delta", response_id: "resp_2", delta: "fresh" });
  assert.deepEqual(transcripts.assistant, ["fresh"]);
  assert.equal(states.at(-1), "speaking");
  dispatch({ type: "response.done", response: { id: "resp_2" } });
  assert.equal(states.at(-1), "listening");
});

test("deltas arriving while cancelling are suppressed", () => {
  const { dispatch, transcripts, states } = makeClient();
  dispatch({ type: "response.created", response: { id: "resp_1" } });
  dispatch({ type: "input_audio_buffer.speech_started" });
  dispatch({ type: "response.output_audio_transcript.delta", response_id: "resp_1", delta: "tail" });
  assert.deepEqual(transcripts.assistant, []);
  assert.equal(states.at(-1), "interrupted");
});

test("repeated turns produce exactly one response.create each", () => {
  const { dispatch, sent, transcripts } = makeClient();

  // Turn 1: plain finalized transcript with no active response.
  dispatch({ type: "conversation.item.input_audio_transcription.completed", transcript: "turn one" });
  assert.equal(sent.filter((e) => e.type === "response.create").length, 1);
  // A duplicate finalized transcript while the response is active must not create another.
  dispatch({ type: "conversation.item.input_audio_transcription.completed", transcript: "turn one again" });
  assert.equal(sent.filter((e) => e.type === "response.create").length, 1);
  dispatch({ type: "response.created", response: { id: "resp_1" } });
  dispatch({ type: "response.done", response: { id: "resp_1" } });

  // Turn 2: barge-in path — queued creation fires once after settlement.
  dispatch({ type: "conversation.item.input_audio_transcription.completed", transcript: "turn two" });
  assert.equal(sent.filter((e) => e.type === "response.create").length, 2);
  dispatch({ type: "response.created", response: { id: "resp_2" } });
  dispatch({ type: "input_audio_buffer.speech_started" });
  dispatch({ type: "conversation.item.input_audio_transcription.completed", transcript: "turn three" });
  dispatch({ type: "response.done", response: { id: "resp_2" } });
  assert.equal(sent.filter((e) => e.type === "response.create").length, 3);

  // Empty transcripts never create responses.
  dispatch({ type: "response.created", response: { id: "resp_3" } });
  dispatch({ type: "response.done", response: { id: "resp_3" } });
  dispatch({ type: "conversation.item.input_audio_transcription.completed", transcript: "   " });
  assert.equal(sent.filter((e) => e.type === "response.create").length, 3);

  // The whitespace transcript is still surfaced to the UI, but never creates a response.
  assert.deepEqual(transcripts.user, ["turn one", "turn one again", "turn two", "turn three", "   "]);
});
