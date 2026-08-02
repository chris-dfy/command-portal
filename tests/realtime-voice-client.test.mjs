import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { RealtimeVoiceClient } from "../src/lib/realtime-voice-client.ts";

// These tests exercise the live barge-in state machine through the governed
// Runtime-admission and exact-response-correlation gates. A provider response
// is never considered active merely because it arrived next.

const CORRELATION_KEY = "nexus_narration_correlation_id";
const clients = [];

function makeClient({ admit = async (text) => ({ admitted: true, spokenSummary: `Runtime: ${text}` }) } = {}) {
  const states = [];
  const errors = [];
  const transcripts = [];
  const audio = {
    muted: false,
    srcObject: null,
    pause() {},
    play() { return Promise.resolve(); },
  };
  const client = new RealtimeVoiceClient(audio, {
    onState: (state) => states.push(state),
    onAmplitude: () => {},
    onUserTranscript: async (text, idempotencyKey) => {
      transcripts.push({ text, idempotencyKey });
      return admit(text, idempotencyKey);
    },
    onError: (message) => errors.push(message),
  });
  const sent = [];
  // TypeScript-private fields are normal properties at runtime. Install the
  // two server-established prerequisites without opening a network session.
  client.channel = {
    readyState: "open",
    send: (raw) => sent.push(JSON.parse(raw)),
    close() {},
  };
  client.promptEchoSignature = "nexus governed runtime prompt signature boundary";
  const dispatch = (event) => client.handleEvent(JSON.stringify(event));
  clients.push(client);
  return { audio, client, dispatch, sent, states, errors, transcripts };
}

function narrationRequests(sent) {
  return sent.filter((event) => event.type === "response.create");
}

async function admitTurn(fixture, transcript, itemId) {
  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: itemId });
  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: itemId });
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript,
    item_id: itemId,
  });
  await fixture.client.admissionQueue;
  return narrationRequests(fixture.sent).at(-1) ?? null;
}

function authorizeNarration(fixture, responseId, request) {
  const correlationId = request?.response?.metadata?.[CORRELATION_KEY];
  assert.match(correlationId ?? "", /^nexus-narration-[0-9a-f-]{36}$/i);
  fixture.dispatch({
    type: "response.created",
    response: {
      id: responseId,
      metadata: { [CORRELATION_KEY]: correlationId },
    },
  });
}

afterEach(() => {
  for (const client of clients.splice(0)) client.stop();
});

test("barge-in cancels the exact Runtime-authorized response and clears output audio", async () => {
  const fixture = makeClient();
  const request = await admitTurn(fixture, "turn one", "item_1");
  authorizeNarration(fixture, "resp_1", request);
  assert.equal(fixture.audio.muted, false);

  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_2" });

  assert.deepEqual(fixture.sent.slice(-2), [
    { type: "response.cancel", response_id: "resp_1" },
    { type: "output_audio_buffer.clear" },
  ]);
  assert.equal(fixture.states.at(-1), "interrupted");
  assert.equal(fixture.audio.muted, true);

  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_3" });
  assert.equal(fixture.sent.filter((event) => event.type === "response.cancel").length, 1);
});

test("benign cancellation race settles and releases one queued governed narration", async () => {
  const fixture = makeClient();
  const first = await admitTurn(fixture, "first question", "item_1");
  authorizeNarration(fixture, "resp_1", first);
  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_2" });
  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_2" });

  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "next question",
    item_id: "item_2",
  });
  await fixture.client.admissionQueue;
  assert.equal(narrationRequests(fixture.sent).length, 1);

  fixture.dispatch({ type: "error", error: { message: "Cancellation failed: no active response found" } });

  assert.deepEqual(fixture.errors, []);
  assert.equal(narrationRequests(fixture.sent).length, 2);
  assert.equal(fixture.states.at(-1), "thinking");
});

test("a cancellation-queued narration cannot survive a third superseding speech turn", async () => {
  const fixture = makeClient();
  const first = await admitTurn(fixture, "first question", "item_1");
  authorizeNarration(fixture, "resp_1", first);

  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_2" });
  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_2" });
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "superseded second question",
    item_id: "item_2",
  });
  await fixture.client.admissionQueue;
  assert.equal(narrationRequests(fixture.sent).length, 1);

  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_3" });
  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_3" });
  assert.ok(fixture.sent.some((event) => (
    event.type === "conversation.item.delete" && event.item_id === "item_2"
  )));

  fixture.dispatch({ type: "error", error: { message: "Cancellation failed: no active response found" } });
  assert.equal(narrationRequests(fixture.sent).length, 1);

  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "current third question",
    item_id: "item_3",
  });
  await fixture.client.admissionQueue;
  assert.equal(narrationRequests(fixture.sent).length, 2);
  assert.match(
    narrationRequests(fixture.sent).at(-1).response.instructions,
    /Runtime: current third question/,
  );
  assert.doesNotMatch(
    narrationRequests(fixture.sent).at(-1).response.instructions,
    /superseded second question/,
  );
});

test("a canonical admission superseded while pending can never request narration", async () => {
  let releaseFirst;
  const firstAdmission = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const fixture = makeClient({
    admit: async (text) => {
      calls += 1;
      if (calls === 1) return firstAdmission;
      return { admitted: true, spokenSummary: `Runtime: ${text}` };
    },
  });

  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_stale" });
  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_stale" });
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "stale first turn",
    item_id: "item_stale",
  });
  await Promise.resolve();

  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_current" });
  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_current" });
  releaseFirst({ admitted: true, spokenSummary: "Stale Runtime result" });
  await fixture.client.admissionQueue;

  assert.equal(narrationRequests(fixture.sent).length, 0);
  assert.ok(fixture.sent.some((event) => (
    event.type === "conversation.item.delete" && event.item_id === "item_stale"
  )));
  assert.equal(fixture.sent.some((event) => event.type === "input_audio_buffer.clear"), false);

  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "current second turn",
    item_id: "item_current",
  });
  await fixture.client.admissionQueue;
  assert.equal(narrationRequests(fixture.sent).length, 1);
  assert.match(
    narrationRequests(fixture.sent)[0].response.instructions,
    /Runtime: current second turn/,
  );
});

test("a delayed prior completion after newer speech_started remains bound to its prior item", async () => {
  const fixture = makeClient();
  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_old" });
  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_old" });
  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_new" });

  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "delayed old question",
    item_id: "item_old",
  });
  await fixture.client.admissionQueue;

  assert.deepEqual(fixture.transcripts, []);
  assert.equal(narrationRequests(fixture.sent).length, 0);
  assert.ok(fixture.sent.some((event) => (
    event.type === "conversation.item.delete" && event.item_id === "item_old"
  )));
  assert.equal(fixture.sent.some((event) => event.type === "input_audio_buffer.clear"), false);

  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_new" });
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "current new question",
    item_id: "item_new",
  });
  await fixture.client.admissionQueue;

  assert.deepEqual(fixture.transcripts.map(({ text }) => text), ["current new question"]);
  assert.equal(narrationRequests(fixture.sent).length, 1);
  assert.match(
    narrationRequests(fixture.sent)[0].response.instructions,
    /Runtime: current new question/,
  );
});

test("non-benign provider errors fail the session", () => {
  const fixture = makeClient();
  fixture.dispatch({ type: "error", error: { message: "provider exploded" } });
  assert.deepEqual(fixture.errors, ["provider exploded"]);
  assert.equal(fixture.states.at(-1), "error");
});

test("stale transcript and completion events cannot consume an authorized response", async () => {
  const fixture = makeClient();
  const request = await admitTurn(fixture, "fresh turn", "item_fresh");
  authorizeNarration(fixture, "resp_fresh", request);

  fixture.dispatch({ type: "response.output_audio_transcript.delta", response_id: "resp_stale", delta: "stale" });
  assert.notEqual(fixture.states.at(-1), "speaking");
  fixture.dispatch({ type: "response.done", response: { id: "resp_stale" } });
  assert.notEqual(fixture.states.at(-1), "listening");

  fixture.dispatch({ type: "response.output_audio_transcript.delta", response_id: "resp_fresh", delta: "fresh" });
  assert.equal(fixture.states.at(-1), "speaking");
  fixture.dispatch({ type: "response.done", response: { id: "resp_fresh" } });
  assert.equal(fixture.states.at(-1), "listening");
  assert.equal(fixture.audio.muted, true);
});

test("deltas from a response being cancelled are suppressed", async () => {
  const fixture = makeClient();
  const request = await admitTurn(fixture, "interrupt me", "item_1");
  authorizeNarration(fixture, "resp_1", request);
  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_2" });
  fixture.dispatch({ type: "response.output_audio_transcript.delta", response_id: "resp_1", delta: "tail" });
  assert.equal(fixture.states.at(-1), "interrupted");
  assert.deepEqual(fixture.errors, []);
});

test("repeated turns admit once and create exactly one correlated narration each", async () => {
  const fixture = makeClient();

  const first = await admitTurn(fixture, "turn one", "item_1");
  assert.equal(narrationRequests(fixture.sent).length, 1);
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "turn one",
    item_id: "item_1_duplicate",
  });
  await fixture.client.admissionQueue;
  assert.equal(narrationRequests(fixture.sent).length, 1);
  assert.equal(fixture.transcripts.length, 1);
  assert.ok(fixture.sent.some((event) => event.type === "conversation.item.delete" && event.item_id === "item_1_duplicate"));
  authorizeNarration(fixture, "resp_1", first);
  fixture.dispatch({ type: "response.done", response: { id: "resp_1" } });

  const second = await admitTurn(fixture, "turn two", "item_2");
  assert.equal(narrationRequests(fixture.sent).length, 2);
  authorizeNarration(fixture, "resp_2", second);
  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_3" });
  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_3" });
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "turn three",
    item_id: "item_3",
  });
  await fixture.client.admissionQueue;
  assert.equal(narrationRequests(fixture.sent).length, 2);
  fixture.dispatch({ type: "response.done", response: { id: "resp_2" } });
  assert.equal(narrationRequests(fixture.sent).length, 3);

  const third = narrationRequests(fixture.sent).at(-1);
  authorizeNarration(fixture, "resp_3", third);
  fixture.dispatch({ type: "response.done", response: { id: "resp_3" } });
  await admitTurn(fixture, "   ", "item_empty");
  assert.equal(narrationRequests(fixture.sent).length, 3);
  assert.equal(fixture.transcripts.length, 3);
  assert.equal(new Set(fixture.transcripts.map(({ idempotencyKey }) => idempotencyKey)).size, 3);
  assert.ok(narrationRequests(fixture.sent).every((event) => (
    event.response.conversation === "none"
    && typeof event.response.metadata[CORRELATION_KEY] === "string"
  )));
});
