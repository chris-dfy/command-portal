import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import {
  CLIENT_SPEECH_TURN_POLICY,
  ClientSpeechTurnSegmenter,
  isVerifiedManualCommitStatus,
  RealtimeVoiceClient,
} from "../src/lib/realtime-voice-client.ts";

const clients = [];
const SPEECH_AMPLITUDE = CLIENT_SPEECH_TURN_POLICY.speechStartThreshold + 0.08;
const SILENCE_AMPLITUDE = Math.max(0, CLIENT_SPEECH_TURN_POLICY.speechEndThreshold - 0.01);

function makeClient({ admit = async (text) => ({ admitted: true, spokenSummary: `Runtime: ${text}` }) } = {}) {
  const states = [];
  const errors = [];
  const transcripts = [];
  const narrated = [];
  const amplitudes = [];
  const client = new RealtimeVoiceClient({
    onState: (state) => states.push(state),
    onAmplitude: (amplitude) => amplitudes.push(amplitude),
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
  client.transportReady = true;
  const dispatch = (event) => client.handleEvent(JSON.stringify(event));
  const fixture = {
    client,
    dispatch,
    sent,
    states,
    errors,
    transcripts,
    narrated,
    amplitudes,
    now: 0,
  };
  clients.push(client);
  return fixture;
}

function sample(fixture, amplitude, elapsedMs = 1) {
  fixture.now += elapsedMs;
  fixture.client.processAmplitudeSample(amplitude, fixture.now);
}

function beginDetectedSpeech(fixture) {
  sample(fixture, SPEECH_AMPLITUDE);
  sample(fixture, SPEECH_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.speechStartHoldMs);
}

function endDetectedSpeech(fixture) {
  sample(fixture, SILENCE_AMPLITUDE);
  sample(fixture, SILENCE_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.speechEndSilenceMs);
}

function detectAndBindTurn(fixture, itemId) {
  const commitsBefore = fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length;
  beginDetectedSpeech(fixture);
  endDetectedSpeech(fixture);
  assert.equal(
    fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length,
    commitsBefore + 1,
  );
  fixture.dispatch({ type: "input_audio_buffer.committed", item_id: itemId });
}

async function admitTurn(fixture, transcript, itemId) {
  detectAndBindTurn(fixture, itemId);
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

test("only the exact Runtime manual-commit status enables live voice", () => {
  const verified = {
    state: "available",
    serverVAD: false,
    clientAudioCommitRequired: true,
    inputAudioCommitEvent: "input_audio_buffer.commit",
  };
  assert.equal(isVerifiedManualCommitStatus(verified), true);
  for (const status of [
    undefined,
    null,
    { ...verified, state: "unavailable" },
    { ...verified, serverVAD: true },
    { ...verified, serverVAD: undefined },
    { ...verified, clientAudioCommitRequired: false },
    { ...verified, clientAudioCommitRequired: undefined },
    { ...verified, inputAudioCommitEvent: "input_audio_buffer.speech_stopped" },
    { ...verified, inputAudioCommitEvent: undefined },
  ]) assert.equal(isVerifiedManualCommitStatus(status), false);
});

test("deterministic segmentation ignores silence and transient noise", () => {
  const segmenter = new ClientSpeechTurnSegmenter();
  assert.equal(segmenter.observe(SILENCE_AMPLITUDE, 0), null);
  assert.equal(segmenter.observe(SILENCE_AMPLITUDE, 10_000), null);
  assert.equal(segmenter.observe(SPEECH_AMPLITUDE, 10_001), null);
  assert.equal(
    segmenter.observe(SPEECH_AMPLITUDE, 10_001 + CLIENT_SPEECH_TURN_POLICY.speechStartHoldMs - 1),
    null,
  );
  assert.equal(segmenter.observe(SILENCE_AMPLITUDE, 10_001 + CLIENT_SPEECH_TURN_POLICY.speechStartHoldMs), null);

  const fixture = makeClient();
  sample(fixture, SILENCE_AMPLITUDE, 20_000);
  sample(fixture, SPEECH_AMPLITUDE);
  sample(fixture, SILENCE_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.speechStartHoldMs - 1);
  sample(fixture, SILENCE_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.speechEndSilenceMs * 2);
  assert.deepEqual(fixture.sent, []);
  assert.deepEqual(fixture.transcripts, []);
});

test("extended idle silence is cleared without creating a speech turn or commit", () => {
  const fixture = makeClient();
  sample(fixture, SILENCE_AMPLITUDE);
  sample(fixture, SILENCE_AMPLITUDE, 4_000);
  sample(fixture, SILENCE_AMPLITUDE, 4_000);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.clear").length, 2);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 0);
  assert.deepEqual(fixture.transcripts, []);
});

test("sustained speech followed by bounded silence emits exactly one manual commit", () => {
  const fixture = makeClient();
  beginDetectedSpeech(fixture);
  sample(fixture, SILENCE_AMPLITUDE);
  sample(fixture, SILENCE_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.speechEndSilenceMs - 1);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 0);
  sample(fixture, SILENCE_AMPLITUDE, 1);
  sample(fixture, SILENCE_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.speechEndSilenceMs * 4);
  assert.deepEqual(
    fixture.sent.filter((event) => event.type === "input_audio_buffer.commit"),
    [{ type: "input_audio_buffer.commit" }],
  );
  assert.equal(fixture.states.at(-1), "thinking");
});

test("speech resuming inside the trailing-silence window remains one turn", () => {
  const fixture = makeClient();
  beginDetectedSpeech(fixture);
  sample(fixture, SILENCE_AMPLITUDE);
  sample(fixture, SILENCE_AMPLITUDE, Math.floor(CLIENT_SPEECH_TURN_POLICY.speechEndSilenceMs / 2));
  sample(fixture, SPEECH_AMPLITUDE);
  sample(fixture, SILENCE_AMPLITUDE);
  sample(fixture, SILENCE_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.speechEndSilenceMs);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 1);
});

test("each committed provider item is bound to one turn and each final transcript enters Runtime once", async () => {
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
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 1);
  assert.equal(fixture.sent.some((event) => event.type === "response.create"), false);
});

test("overlapping committed turns bind FIFO while only the current turn may narrate", async () => {
  const fixture = makeClient();
  beginDetectedSpeech(fixture);
  endDetectedSpeech(fixture);
  beginDetectedSpeech(fixture);
  endDetectedSpeech(fixture);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 2);

  fixture.dispatch({ type: "input_audio_buffer.committed", item_id: "item_old" });
  fixture.dispatch({ type: "input_audio_buffer.committed", item_id: "item_new" });
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "superseded request",
    item_id: "item_old",
  });
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "current request",
    item_id: "item_new",
  });
  await fixture.client.admissionQueue;

  assert.deepEqual(fixture.transcripts.map(({ text }) => text), ["current request"]);
  assert.deepEqual(fixture.narrated, ["Runtime: current request"]);
  assert.ok(fixture.sent.some((event) => event.type === "conversation.item.delete" && event.item_id === "item_old"));
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

  detectAndBindTurn(fixture, "item_old");
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "old request",
    item_id: "item_old",
  });
  await Promise.resolve();

  detectAndBindTurn(fixture, "item_new");
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
  detectAndBindTurn(fixture, "item_old");
  detectAndBindTurn(fixture, "item_new");
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "delayed old request",
    item_id: "item_old",
  });
  await fixture.client.admissionQueue;

  assert.deepEqual(fixture.transcripts, []);
  assert.deepEqual(fixture.narrated, []);
  assert.ok(fixture.sent.some((event) => event.type === "conversation.item.delete" && event.item_id === "item_old"));

  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "current request",
    item_id: "item_new",
  });
  await fixture.client.admissionQueue;
  assert.deepEqual(fixture.transcripts.map(({ text }) => text), ["current request"]);
  assert.deepEqual(fixture.narrated, ["Runtime: current request"]);
});

test("mute discards a partial turn and unmute starts a clean turn", async () => {
  const fixture = makeClient();
  beginDetectedSpeech(fixture);
  fixture.client.setMicrophoneMuted(true);
  sample(fixture, SPEECH_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.maximumTurnMs);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 0);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.clear").length, 1);
  assert.equal(fixture.amplitudes.at(-1), 0);

  fixture.client.setMicrophoneMuted(false);
  await admitTurn(fixture, "clean request", "item_clean");
  assert.deepEqual(fixture.transcripts.map(({ text }) => text), ["clean request"]);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 1);
});

test("stop abandons detected speech without committing or admitting it", () => {
  const fixture = makeClient();
  beginDetectedSpeech(fixture);
  fixture.client.stop();
  sample(fixture, SILENCE_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.speechEndSilenceMs * 2);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 0);
  assert.deepEqual(fixture.transcripts, []);
  assert.equal(fixture.states.at(-1), "idle");
});

test("maximum turn duration creates one bounded commit even without trailing silence", () => {
  const fixture = makeClient();
  beginDetectedSpeech(fixture);
  sample(fixture, SPEECH_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.maximumTurnMs);
  sample(fixture, SPEECH_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.maximumTurnMs);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 1);
});

test("duplicate, unknown, and server-VAD commit bindings fail closed", () => {
  const duplicate = makeClient();
  detectAndBindTurn(duplicate, "item_duplicate");
  duplicate.dispatch({ type: "input_audio_buffer.committed", item_id: "item_duplicate" });
  assert.equal(duplicate.states.at(-1), "error");
  assert.match(duplicate.errors.at(-1), /exactly one detected speech turn/);

  const unknown = makeClient();
  unknown.dispatch({ type: "input_audio_buffer.committed", item_id: "item_unknown" });
  assert.equal(unknown.states.at(-1), "error");
  assert.match(unknown.errors.at(-1), /exactly one detected speech turn/);

  for (const type of ["input_audio_buffer.speech_started", "input_audio_buffer.speech_stopped"]) {
    const serverVad = makeClient();
    serverVad.dispatch({ type, item_id: "item_vad" });
    assert.equal(serverVad.states.at(-1), "error");
    assert.match(serverVad.errors.at(-1), /server-VAD event/);
  }
});

test("prompt echoes are deleted and unbound completions terminate without canonical submission", async () => {
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
  assert.equal(unbound.states.at(-1), "error");
  assert.match(unbound.errors.at(-1), /no detected speech-turn binding/);
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

test("invalid or non-monotonic acoustic samples fail closed", () => {
  const fixture = makeClient();
  fixture.client.processAmplitudeSample(Number.NaN, 1);
  assert.equal(fixture.states.at(-1), "error");
  assert.match(fixture.errors.at(-1), /invalid acoustic sample/);

  const nonMonotonic = makeClient();
  sample(nonMonotonic, SILENCE_AMPLITUDE, 10);
  nonMonotonic.client.processAmplitudeSample(SILENCE_AMPLITUDE, 9);
  assert.equal(nonMonotonic.states.at(-1), "error");
  assert.match(nonMonotonic.errors.at(-1), /invalid acoustic sample/);
});

test("the browser offer is send-only and source contains no provider answer path", async () => {
  const source = await readFile(new URL("../src/lib/realtime-voice-client.ts", import.meta.url), "utf8");
  assert.match(source, /addTransceiver\(track, \{ direction: "sendonly"/);
  assert.match(source, /Boolean\(window\.AudioContext\)/);
  assert.match(source, /context\.state !== "running"/);
  assert.match(source, /type: "input_audio_buffer\.commit"/);
  assert.doesNotMatch(source, /\.play\(/);
  assert.doesNotMatch(source, /type:\s*["']response\.create["']/);
  assert.doesNotMatch(source, /session\.update|\binstructions\b|\btools\s*:/);
  assert.doesNotMatch(source, /srcObject\s*=\s*event\.streams/);
  assert.doesNotMatch(source, /HTMLAudioElement|document\.createElement\(['"]audio/);
  assert.match(source, /attempted to attach output media to a transcription-only session/);
});
