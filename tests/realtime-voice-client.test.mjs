import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import { RealtimeVoiceClient } from "../src/lib/realtime-voice-client.ts";

const clients = [];

function makeClient({ admit = async (text) => ({ admitted: true, spokenSummary: `Runtime: ${text}` }) } = {}) {
  const states = [];
  const errors = [];
  const transcripts = [];
  const narrated = [];
  const client = new RealtimeVoiceClient({
    onState: (state) => states.push(state),
    onAmplitude: () => {},
    onUserTranscript: async (text, idempotencyKey) => {
      transcripts.push({ text, idempotencyKey });
      return admit(text, idempotencyKey);
    },
    onRuntimeResponse: (text) => narrated.push(text),
    onError: (message) => errors.push(message),
  });
  const sent = [];
  client.channel = {
    readyState: "open",
    send: (raw) => sent.push(JSON.parse(raw)),
    close() {},
  };
  client.promptEchoSignature = "nexus governed runtime prompt signature boundary";
  const dispatch = (event) => client.handleEvent(JSON.stringify(event));
  clients.push(client);
  return { client, dispatch, sent, states, errors, transcripts, narrated };
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
}

afterEach(() => {
  for (const client of clients.splice(0)) client.stop();
});

test("each finalized provider transcript enters Runtime exactly once and only Runtime text is narrated", async () => {
  const fixture = makeClient();
  await admitTurn(fixture, "check runtime status", "item_1");

  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "check runtime status",
    item_id: "item_1",
  });
  await fixture.client.admissionQueue;

  assert.equal(fixture.transcripts.length, 1);
  assert.equal(fixture.narrated.length, 1);
  assert.deepEqual(fixture.narrated, ["Runtime: check runtime status"]);
  assert.match(fixture.transcripts[0].idempotencyKey, /^[0-9a-f-]{36}$/i);
  assert.equal(fixture.sent.some((event) => event.type === "response.create"), false);
});

test("a superseded in-flight admission can never narrate after a newer speech turn wins", async () => {
  let releaseFirst;
  const firstAdmission = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const fixture = makeClient({
    admit: async (text) => {
      calls += 1;
      if (calls === 1) return firstAdmission;
      return { admitted: true, spokenSummary: `Runtime current: ${text}` };
    },
  });

  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_old" });
  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_old" });
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "old request",
    item_id: "item_old",
  });
  await Promise.resolve();

  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_new" });
  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_new" });
  releaseFirst({ admitted: true, spokenSummary: "stale Runtime result" });
  await fixture.client.admissionQueue;

  assert.deepEqual(fixture.narrated, []);
  assert.ok(fixture.sent.some((event) => event.type === "conversation.item.delete" && event.item_id === "item_old"));

  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "new request",
    item_id: "item_new",
  });
  await fixture.client.admissionQueue;
  assert.deepEqual(fixture.narrated, ["Runtime current: new request"]);
  assert.deepEqual(fixture.transcripts.map(({ text }) => text), ["old request", "new request"]);
  assert.equal(fixture.sent.some((event) => event.type === "response.create"), false);
});

test("a delayed completion remains bound to its original provider item and cannot consume the new turn", async () => {
  const fixture = makeClient();
  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_old" });
  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_old" });
  fixture.dispatch({ type: "input_audio_buffer.speech_started", item_id: "item_new" });
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "delayed old request",
    item_id: "item_old",
  });
  await fixture.client.admissionQueue;

  assert.deepEqual(fixture.transcripts, []);
  assert.deepEqual(fixture.narrated, []);
  assert.ok(fixture.sent.some((event) => event.type === "conversation.item.delete" && event.item_id === "item_old"));

  fixture.dispatch({ type: "input_audio_buffer.speech_stopped", item_id: "item_new" });
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "current request",
    item_id: "item_new",
  });
  await fixture.client.admissionQueue;
  assert.deepEqual(fixture.transcripts.map(({ text }) => text), ["current request"]);
  assert.deepEqual(fixture.narrated, ["Runtime: current request"]);
});

test("prompt echoes and unbound completions are deleted without canonical submission", async () => {
  const echo = makeClient();
  await admitTurn(echo, "nexus governed runtime prompt signature boundary", "item_echo");
  assert.deepEqual(echo.transcripts, []);
  assert.deepEqual(echo.narrated, []);
  assert.ok(echo.sent.some((event) => event.type === "conversation.item.delete" && event.item_id === "item_echo"));

  const unbound = makeClient();
  unbound.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "unbound request",
    item_id: "item_unbound",
  });
  await unbound.client.admissionQueue;
  assert.deepEqual(unbound.transcripts, []);
  assert.ok(unbound.sent.some((event) => event.type === "conversation.item.delete" && event.item_id === "item_unbound"));
});

test("provider response and output events are protocol violations and fail closed", () => {
  for (const type of [
    "response.created",
    "response.output_audio.delta",
    "response.output_audio_transcript.delta",
    "response.done",
    "output_audio_buffer.started",
  ]) {
    const fixture = makeClient();
    fixture.dispatch({ type });
    assert.equal(fixture.states.at(-1), "error", type);
    assert.match(fixture.errors.at(-1), /forbidden output event/, type);
    assert.equal(fixture.sent.some((event) => event.type === "response.create"), false, type);
  }
});

test("malformed provider protocol data fails closed", () => {
  const fixture = makeClient();
  fixture.client.handleEvent("{not-json");
  assert.equal(fixture.states.at(-1), "error");
  assert.deepEqual(fixture.errors, ["Realtime provider emitted malformed protocol data."]);
});

test("provider protocol data without an event type fails closed", () => {
  const fixture = makeClient();
  fixture.dispatch({ transcript: "not a typed protocol event" });
  assert.equal(fixture.states.at(-1), "error");
  assert.match(fixture.errors.at(-1), /without an event type/);
});

test("the browser offer is send-only and source contains no provider output attachment or response request", async () => {
  const source = await readFile(new URL("../src/lib/realtime-voice-client.ts", import.meta.url), "utf8");
  assert.match(source, /addTransceiver\(track, \{ direction: "sendonly"/);
  assert.doesNotMatch(source, /\.play\(/);
  assert.doesNotMatch(source, /type:\s*["']response\.create["']/);
  assert.doesNotMatch(source, /srcObject\s*=\s*event\.streams/);
  assert.doesNotMatch(source, /HTMLAudioElement|document\.createElement\(['"]audio/);
  assert.match(source, /attempted to attach output media to a transcription-only session/);
});
