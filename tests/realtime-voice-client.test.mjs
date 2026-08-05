import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import {
  CLIENT_SPEECH_TURN_POLICY,
  ClientSpeechTurnSegmenter,
  isVerifiedManualCommitStatus,
  RealtimeVoiceClient,
  RUNTIME_REALTIME_ARTIFACT_IDENTITY_HEADER,
  RUNTIME_REALTIME_CLIENT_PROFILE,
  RUNTIME_REALTIME_CLIENT_PROFILE_HEADER,
  RUNTIME_REALTIME_CONTRACT_HEADER,
  RUNTIME_REALTIME_CONTRACT_VERSION,
  RUNTIME_REALTIME_INPUT_MODE,
  RUNTIME_REALTIME_INPUT_MODE_HEADER,
  RUNTIME_REALTIME_RECEIPT_DIGEST_HEADER,
  runtimeRealtimeInputModeFromHeaders,
  tracklessRealtimeOfferIsValid,
} from "../src/lib/realtime-voice-client.ts";
import {
  RealtimePcmAppendCoordinator,
  encodePcm16Base64,
} from "../src/lib/realtime-pcm-input.ts";

const clients = [];
const SPEECH_AMPLITUDE = CLIENT_SPEECH_TURN_POLICY.speechStartThreshold + 0.08;
const SILENCE_AMPLITUDE = Math.max(0, CLIENT_SPEECH_TURN_POLICY.speechEndThreshold - 0.01);

function makeClient({ admit = async (text) => ({ admitted: true, spokenSummary: `Runtime: ${text}` }) } = {}) {
  const states = [];
  const errors = [];
  const transcripts = [];
  const admissions = [];
  const narrated = [];
  const amplitudes = [];
  const errorContexts = [];
  const client = new RealtimeVoiceClient({
    onState: (state) => states.push(state),
    onAmplitude: (amplitude) => amplitudes.push(amplitude),
    onUserTranscript: async (text, idempotencyKey) => {
      transcripts.push({ text, idempotencyKey });
      const admission = await admit(text, idempotencyKey);
      admissions.push(admission);
      return admission;
    },
    onRuntimeResponse: (text) => narrated.push(text),
    onError: (message, context) => {
      errors.push(message);
      errorContexts.push(context);
    },
  });
  const sent = [];
  client.channel = {
    readyState: "open",
    send: (raw) => sent.push(JSON.parse(raw)),
    close() {},
  };
  client.promptEchoSignature = "nexus governed runtime prompt signature boundary";
  client.transportReady = true;
  const microphoneTrack = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  client.stream = {
    getAudioTracks: () => [microphoneTrack],
    getTracks: () => [microphoneTrack],
  };
  const dispatch = (event) => client.handleEvent(JSON.stringify(event));
  const fixture = {
    client,
    dispatch,
    sent,
    states,
    errors,
    errorContexts,
    transcripts,
    admissions,
    narrated,
    amplitudes,
    microphoneTrack,
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
    contractVersion: RUNTIME_REALTIME_CONTRACT_VERSION,
    transportProfile: RUNTIME_REALTIME_CLIENT_PROFILE,
    supportedClientProfiles: [RUNTIME_REALTIME_CLIENT_PROFILE],
    preActivationNegotiationRequired: true,
    serverVAD: false,
    clientAudioAppendRequired: true,
    inputAudioAppendEvent: "input_audio_buffer.append",
    clientAudioCommitRequired: true,
    inputAudioCommitEvent: "input_audio_buffer.commit",
    providerOfferAudioDirection: "inactive",
    providerOfferAudioTrackAttached: false,
    rtpAudioNegotiated: false,
    artifactIdentity: { identityDigest: `sha256:${"a".repeat(64)}` },
  };
  assert.equal(isVerifiedManualCommitStatus(verified), true);
  for (const status of [
    undefined,
    null,
    { ...verified, state: "unavailable" },
    { ...verified, contractVersion: "nexus.realtime-voice@1.0.0" },
    { ...verified, transportProfile: "full-duplex-rtp-v1" },
    { ...verified, supportedClientProfiles: [] },
    { ...verified, preActivationNegotiationRequired: false },
    { ...verified, serverVAD: true },
    { ...verified, serverVAD: undefined },
    { ...verified, clientAudioAppendRequired: false },
    { ...verified, inputAudioAppendEvent: "response.create" },
    { ...verified, clientAudioCommitRequired: false },
    { ...verified, clientAudioCommitRequired: undefined },
    { ...verified, inputAudioCommitEvent: "input_audio_buffer.speech_stopped" },
    { ...verified, inputAudioCommitEvent: undefined },
    { ...verified, providerOfferAudioDirection: "sendonly" },
    { ...verified, providerOfferAudioDirection: undefined },
    { ...verified, providerOfferAudioTrackAttached: true },
    { ...verified, providerOfferAudioTrackAttached: undefined },
    { ...verified, rtpAudioNegotiated: true },
    { ...verified, artifactIdentity: { identityDigest: "historical" } },
  ]) assert.equal(isVerifiedManualCommitStatus(status), false);
});

test("only the exact per-call Runtime input-mode attestation is accepted", () => {
  assert.equal(
    runtimeRealtimeInputModeFromHeaders(new Headers({
      [RUNTIME_REALTIME_INPUT_MODE_HEADER]: RUNTIME_REALTIME_INPUT_MODE,
    })),
    RUNTIME_REALTIME_INPUT_MODE,
  );
  for (const value of [undefined, "", "client-pcm-append-commit-v0", "CLIENT-PCM-APPEND-COMMIT-V1", "client-pcm-append-commit-v1 "]) {
    const headers = { get: () => value ?? null };
    assert.equal(runtimeRealtimeInputModeFromHeaders(headers), null);
  }
});

test("PCM pre-roll, live audio, and commit use one ordered data-channel path", () => {
  const encoded = Buffer.from(encodePcm16Base64(new Float32Array([-1, 0, 1])), "base64");
  assert.deepEqual([...encoded], [0x00, 0x80, 0x00, 0x00, 0xff, 0x7f]);
  const events = [];
  const pcm = new RealtimePcmAppendCoordinator((event) => {
    events.push(event);
    return true;
  }, 2);
  assert.equal(pcm.acceptSamples(new Float32Array([0.1, -0.1])), true);
  assert.equal(pcm.acceptSamples(new Float32Array([0.2, -0.2])), true);
  assert.equal(pcm.beginTurn(), true);
  assert.equal(pcm.acceptSamples(new Float32Array([0.3, -0.3])), true);
  assert.equal(pcm.commitTurn(), true);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "input_audio_buffer.clear",
      "input_audio_buffer.append",
      "input_audio_buffer.append",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
    ],
  );
  assert.ok(events.filter((event) => event.type === "input_audio_buffer.append")
    .every((event) => typeof event.audio === "string" && event.audio.length > 0));
  assert.equal(pcm.commitTurn(), false);
});

test("the browser rejects missing or wrong per-call attestation before accepting remote SDP", async () => {
  const keys = [
    "window",
    "navigator",
    "RTCPeerConnection",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "fetch",
  ];
  const descriptors = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const restore = () => {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
  const remoteDescriptions = [];
  const transceiverOffers = [];
  let callInputMode = null;
  const track = { enabled: true, readyState: "live", stop() {} };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  class FakeAudioContext {
    state = "running";
    sampleRate = 24_000;
    destination = {};
    createAnalyser() {
      return {
        fftSize: 256,
        smoothingTimeConstant: 0,
        frequencyBinCount: 1,
        getByteFrequencyData(values) { values[0] = 0; },
      };
    }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return { onaudioprocess: null, connect() {}, disconnect() {} }; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    async resume() {}
    async close() {}
  }
  class FakePeer {
    connectionState = "connected";
    addTransceiver(kind, options) {
      transceiverOffers.push({ kind, options });
      return { direction: options?.direction, currentDirection: "inactive", sender: { track: null } };
    }
    createDataChannel() {
      return { readyState: "connecting", addEventListener() {}, close() {} };
    }
    async createOffer() {
      return {
        type: "offer",
        sdp: "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0 1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:0\r\na=inactive\r\na=rtpmap:111 opus/48000/2\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=mid:1\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n",
      };
    }
    async setLocalDescription() {}
    async setRemoteDescription(description) { remoteDescriptions.push(description); }
    close() {}
  }
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        RTCPeerConnection: FakePeer,
        AudioContext: FakeAudioContext,
        dispatchEvent() {},
      },
    });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { mediaDevices: { getUserMedia: async () => stream } },
    });
    Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: FakePeer });
    Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: () => 1 });
    Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: () => {} });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async (url) => {
        if (String(url).endsWith("/realtime-voice")) {
          return new Response(JSON.stringify({
            ok: true,
            data: {
              state: "available",
              contractVersion: RUNTIME_REALTIME_CONTRACT_VERSION,
              transportProfile: RUNTIME_REALTIME_CLIENT_PROFILE,
              supportedClientProfiles: [RUNTIME_REALTIME_CLIENT_PROFILE],
              preActivationNegotiationRequired: true,
              serverVAD: false,
              clientAudioAppendRequired: true,
              inputAudioAppendEvent: "input_audio_buffer.append",
              clientAudioCommitRequired: true,
              inputAudioCommitEvent: "input_audio_buffer.commit",
              providerOfferAudioDirection: "inactive",
              providerOfferAudioTrackAttached: false,
              rtpAudioNegotiated: false,
              artifactIdentity: { identityDigest: `sha256:${"a".repeat(64)}` },
            },
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        return new Response("v=0\r\na=answer\r\n", {
          status: 201,
          headers: {
            "Content-Type": "application/sdp",
            "X-NEXUS-Prompt-Echo-Signature": "nexus governed runtime prompt signature boundary",
            [RUNTIME_REALTIME_CONTRACT_HEADER]: RUNTIME_REALTIME_CONTRACT_VERSION,
            [RUNTIME_REALTIME_CLIENT_PROFILE_HEADER]: RUNTIME_REALTIME_CLIENT_PROFILE,
            [RUNTIME_REALTIME_ARTIFACT_IDENTITY_HEADER]: `sha256:${"a".repeat(64)}`,
            [RUNTIME_REALTIME_RECEIPT_DIGEST_HEADER]: `sha256:${"b".repeat(64)}`,
            ...(callInputMode === null
              ? {}
              : { [RUNTIME_REALTIME_INPUT_MODE_HEADER]: callInputMode }),
          },
        });
      },
    });

    for (const inputMode of [null, "client-pcm-append-commit-v0"]) {
      callInputMode = inputMode;
      const client = new RealtimeVoiceClient({
        onState() {}, onAmplitude() {}, onUserTranscript: async () => ({ admitted: false }),
        onRuntimeResponse() {}, onError() {},
      });
      clients.push(client);
      const before = remoteDescriptions.length;
      await assert.rejects(
        client.connect(),
        /did not attest the exact ordered PCM append\/commit mode/,
      );
      assert.equal(remoteDescriptions.length, before, String(inputMode));
    }

    callInputMode = RUNTIME_REALTIME_INPUT_MODE;
    const accepted = new RealtimeVoiceClient({
      onState() {}, onAmplitude() {}, onUserTranscript: async () => ({ admitted: false }),
      onRuntimeResponse() {}, onError() {},
    });
    clients.push(accepted);
    await accepted.connect();
    assert.equal(remoteDescriptions.length, 1);
    assert.equal(remoteDescriptions[0].sdp, "v=0\r\na=answer\r\n");
    assert.equal(transceiverOffers.length, 3);
    assert.deepEqual(
      transceiverOffers,
      Array.from({ length: 3 }, () => ({ kind: "audio", options: { direction: "inactive" } })),
    );
  } finally {
    for (const client of clients.splice(0)) client.stop();
    restore();
  }
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

test("a committed turn disables the microphone and rejects a second commit before provider binding", () => {
  const fixture = makeClient();
  beginDetectedSpeech(fixture);
  endDetectedSpeech(fixture);
  assert.equal(fixture.microphoneTrack.enabled, false);
  beginDetectedSpeech(fixture);
  endDetectedSpeech(fixture);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 1);
  fixture.dispatch({ type: "input_audio_buffer.committed", item_id: "item_1" });
  beginDetectedSpeech(fixture);
  endDetectedSpeech(fixture);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 1);
});

test("a Runtime POST cannot be superseded and its first verified result narrates exactly once", async () => {
  let releaseFirst;
  const firstAdmission = new Promise((resolve) => { releaseFirst = resolve; });
  const fixture = makeClient({
    admit: async () => firstAdmission,
  });

  detectAndBindTurn(fixture, "item_1");
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "execute the governed request",
    item_id: "item_1",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.transcripts.length, 1);

  beginDetectedSpeech(fixture);
  endDetectedSpeech(fixture);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 1);
  assert.equal(fixture.microphoneTrack.enabled, false);

  releaseFirst({ admitted: true, spokenSummary: "Verified Runtime result" });
  await fixture.client.admissionQueue;
  assert.deepEqual(fixture.narrated, ["Verified Runtime result"]);
  assert.equal(fixture.admissions.length, 1);
  assert.equal(fixture.microphoneTrack.enabled, true);

  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "execute the governed request",
    item_id: "item_1",
  });
  await fixture.client.admissionQueue;
  assert.deepEqual(fixture.narrated, ["Verified Runtime result"]);
  assert.equal(fixture.transcripts.length, 1);
});

test("a later turn can begin only after the first Runtime disposition releases it", async () => {
  const fixture = makeClient();
  await admitTurn(fixture, "first request", "item_first");
  assert.equal(fixture.microphoneTrack.enabled, true);

  detectAndBindTurn(fixture, "item_next");
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "next request",
    item_id: "item_next",
  });
  await fixture.client.admissionQueue;
  assert.deepEqual(fixture.transcripts.map(({ text }) => text), ["first request", "next request"]);
  assert.deepEqual(fixture.narrated, ["Runtime: first request", "Runtime: next request"]);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 2);
  assert.equal(fixture.sent.some((event) => event.type === "response.create"), false);
});

test("stopping transport cannot invalidate an already submitted canonical Runtime interaction", async () => {
  let releaseAdmission;
  const pendingAdmission = new Promise((resolve) => { releaseAdmission = resolve; });
  const fixture = makeClient({ admit: async () => pendingAdmission });
  detectAndBindTurn(fixture, "item_submitted");
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "submitted request",
    item_id: "item_submitted",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.transcripts.length, 1);
  fixture.client.stop();

  releaseAdmission({ admitted: true, spokenSummary: "Runtime result delivered to the UI callback" });
  await fixture.client.admissionQueue;
  assert.equal(fixture.admissions.length, 1);
  assert.equal(fixture.admissions[0].spokenSummary, "Runtime result delivered to the UI callback");
  assert.deepEqual(fixture.narrated, []);
  assert.equal(fixture.states.at(-1), "idle");
});

test("a provider failure during canonical admission prohibits a competing retry identity", async () => {
  let releaseAdmission;
  const pendingAdmission = new Promise((resolve) => { releaseAdmission = resolve; });
  const fixture = makeClient({ admit: async () => pendingAdmission });
  detectAndBindTurn(fixture, "item_provider_failure");
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "execute exactly once",
    item_id: "item_provider_failure",
  });
  await new Promise((resolve) => setImmediate(resolve));
  const interactionId = fixture.transcripts[0].idempotencyKey;

  fixture.dispatch({ type: "error", error: { message: "provider transport lost" } });
  assert.deepEqual(fixture.errorContexts.at(-1), {
    interactionId,
    retryProhibited: true,
  });
  assert.match(fixture.errors.at(-1), /remains in flight; do not retry it under a new identifier/);

  releaseAdmission({ admitted: true, spokenSummary: "Original Runtime result" });
  await fixture.client.admissionQueue;
  assert.equal(fixture.admissions.length, 1);
  assert.deepEqual(fixture.narrated, []);
});

test("an indeterminate canonical POST is surfaced as do-not-retry and cannot stage a competing turn", async () => {
  const interactionId = "11111111-1111-4111-8111-111111111111";
  const error = Object.assign(new Error(`Interaction ${interactionId} is indeterminate.`), {
    interactionId,
    retryProhibited: true,
  });
  const fixture = makeClient({ admit: async () => { throw error; } });
  detectAndBindTurn(fixture, "item_indeterminate");
  fixture.dispatch({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "execute once",
    item_id: "item_indeterminate",
  });
  await fixture.client.admissionQueue;
  assert.equal(fixture.states.at(-1), "error");
  assert.deepEqual(fixture.errorContexts.at(-1), {
    interactionId,
    retryProhibited: true,
  });
  beginDetectedSpeech(fixture);
  endDetectedSpeech(fixture);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 1);
});

test("mute discards a partial turn and unmute starts a clean turn", async () => {
  const fixture = makeClient();
  beginDetectedSpeech(fixture);
  fixture.client.setMicrophoneMuted(true);
  sample(fixture, SPEECH_AMPLITUDE, CLIENT_SPEECH_TURN_POLICY.maximumTurnMs);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.commit").length, 0);
  assert.equal(fixture.sent.filter((event) => event.type === "input_audio_buffer.clear").length, 2);
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

test("provider failures expose only a bounded safe reason code", () => {
  const fixture = makeClient();
  fixture.dispatch({
    type: "error",
    error: { message: "masked-provider-secret-must-not-reach-the-operator" },
  });
  assert.equal(fixture.states.at(-1), "error");
  assert.match(fixture.errors.at(-1), /Reason: realtime_provider_error/);
  assert.doesNotMatch(fixture.errors.at(-1), /masked-provider-secret/);
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

test("the browser offer has one inactive trackless audio section and no provider answer path", async () => {
  const source = await readFile(new URL("../src/lib/realtime-voice-client.ts", import.meta.url), "utf8");
  const pcmSource = await readFile(new URL("../src/lib/realtime-pcm-input.ts", import.meta.url), "utf8");
  assert.match(source, /addTransceiver\("audio", \{ direction: "inactive" \}\)/);
  assert.doesNotMatch(source, /\.addTrack\(/);
  assert.match(source, /Boolean\(window\.AudioContext\)/);
  assert.match(source, /context\.state !== "running"/);
  assert.equal((pcmSource.match(/type: "input_audio_buffer\.append"/g) ?? []).length, 1);
  assert.equal((pcmSource.match(/type: "input_audio_buffer\.commit"/g) ?? []).length, 1);
  assert.doesNotMatch(source, /\.play\(/);
  assert.doesNotMatch(source, /type:\s*["']response\.create["']/);
  assert.doesNotMatch(source, /session\.update|\binstructions\b|\btools\s*:/);
  assert.doesNotMatch(source, /srcObject\s*=\s*event\.streams/);
  assert.doesNotMatch(source, /HTMLAudioElement|document\.createElement\(['"]audio/);
  assert.match(source, /attempted to attach forbidden output audio/);
  const offer = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0 1\r\nm=audio 9 UDP\/TLS\/RTP\/SAVPF 111\r\na=mid:0\r\na=inactive\r\na=rtpmap:111 opus\/48000\/2\r\nm=application 9 UDP\/DTLS\/SCTP webrtc-datachannel\r\na=mid:1\r\na=sctp-port:5000\r\n";
  assert.equal(tracklessRealtimeOfferIsValid(offer), true);
  assert.equal(tracklessRealtimeOfferIsValid(offer.replace("a=inactive", "a=sendrecv")), false);
  assert.equal(tracklessRealtimeOfferIsValid(offer.replace("a=inactive", "a=inactive\r\na=msid:stream track")), false);
  assert.equal(tracklessRealtimeOfferIsValid(offer.replace("a=inactive", "a=inactive\r\na=ssrc:1 cname:track")), false);
  assert.equal(tracklessRealtimeOfferIsValid(offer.replace("m=audio 9", "m=audio 0")), false);
  assert.equal(tracklessRealtimeOfferIsValid(`${offer}m=video 9 UDP/TLS/RTP/SAVPF 96\r\n`), false);
});

test("Live Voice Active proof requires exact negotiated audio, microphone, PCM, analyser, and artifact postconditions", () => {
  const proofs = [];
  const states = [];
  const sent = [];
  const client = new RealtimeVoiceClient({
    onState: (state) => states.push(state),
    onAmplitude() {},
    onUserTranscript: async () => ({ admitted: false }),
    onRuntimeResponse() {},
    onError() {},
    onLiveProof: (proof) => proofs.push(proof),
  });
  clients.push(client);
  client.peer = { connectionState: "connected", close() {} };
  client.providerAudioTransceiver = {
    currentDirection: "inactive",
    sender: { track: null },
  };
  client.channelOpen = true;
  client.channel = {
    readyState: "open",
    send: (raw) => sent.push(JSON.parse(raw)),
    close() {},
  };
  client.stream = {
    getAudioTracks: () => [{ readyState: "live", stop() {} }],
    getTracks: () => [],
  };
  client.pcmCapture = { stop() {}, sampleRate: 24_000 };
  client.pcmSamplesObserved = true;
  client.analyserFrameObserved = true;
  client.promptEchoSignature = "nexus governed runtime prompt signature boundary";
  client.realtimeInputModeAttested = true;
  client.contractAttested = true;
  client.artifactIdentityDigest = `sha256:${"a".repeat(64)}`;
  client.receiptDigest = `sha256:${"b".repeat(64)}`;
  client.maybeActivateLive();
  assert.equal(states.at(-1), "listening");
  assert.deepEqual(sent.map((event) => event.type), ["input_audio_buffer.clear"]);
  assert.deepEqual(proofs, [{
    contractVersion: RUNTIME_REALTIME_CONTRACT_VERSION,
    transportProfile: RUNTIME_REALTIME_CLIENT_PROFILE,
    artifactIdentityDigest: `sha256:${"a".repeat(64)}`,
    receiptDigest: `sha256:${"b".repeat(64)}`,
    connectionState: "live",
    microphoneTrackLive: true,
    pcmCaptureActive: true,
    pcmSamplesObserved: true,
    analyserGateActive: true,
    providerAudioTransceiverDirection: "inactive",
    providerAudioSenderTrackAttached: false,
    remoteAudioTrackObserved: false,
  }]);

  client.transportReady = false;
  client.providerAudioTransceiver.currentDirection = "sendrecv";
  client.maybeActivateLive();
  assert.equal(proofs.length, 1);
});
