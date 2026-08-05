/** Ordered 24 kHz PCM ingress for transcription-only Realtime sessions. */

export const REALTIME_PCM_SAMPLE_RATE = 24_000;
export const REALTIME_PCM_CHUNK_SIZE = 2_048;
export const REALTIME_PCM_PRE_ROLL_CHUNKS = 8;

export type RealtimePcmEventSender = (event: Record<string, unknown>) => boolean;

export function encodePcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    const pcm = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
    view.setInt16(index * 2, pcm, true);
  }
  let binary = "";
  const stride = 0x4000;
  for (let offset = 0; offset < bytes.length; offset += stride) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + stride));
  }
  return btoa(binary);
}

/**
 * Preserves bounded pre-roll, then serializes clear, PCM appends, and commit on
 * one reliable ordered data channel. The provider-required audio m-line stays
 * inactive and trackless, so no RTP audio can race the ordered PCM path.
 */
export class RealtimePcmAppendCoordinator {
  private readonly preRoll: string[] = [];
  private readonly send: RealtimePcmEventSender;
  private readonly maximumPreRollChunks: number;
  private turnOpen = false;

  constructor(
    send: RealtimePcmEventSender,
    maximumPreRollChunks = REALTIME_PCM_PRE_ROLL_CHUNKS,
  ) {
    if (!Number.isInteger(maximumPreRollChunks) || maximumPreRollChunks < 1) {
      throw new Error("Realtime PCM pre-roll capacity must be a positive integer.");
    }
    this.send = send;
    this.maximumPreRollChunks = maximumPreRollChunks;
  }

  acceptSamples(samples: Float32Array): boolean {
    if (!(samples instanceof Float32Array) || samples.length === 0) return false;
    const audio = encodePcm16Base64(samples);
    if (this.turnOpen) return this.sendAppend(audio);
    this.preRoll.push(audio);
    while (this.preRoll.length > this.maximumPreRollChunks) this.preRoll.shift();
    return true;
  }

  beginTurn(): boolean {
    if (this.turnOpen || !this.send({ type: "input_audio_buffer.clear" })) return false;
    const buffered = this.preRoll.splice(0);
    this.turnOpen = true;
    for (const audio of buffered) {
      if (!this.sendAppend(audio)) {
        this.turnOpen = false;
        return false;
      }
    }
    return true;
  }

  commitTurn(): boolean {
    if (!this.turnOpen) return false;
    this.turnOpen = false;
    this.preRoll.splice(0);
    return this.send({ type: "input_audio_buffer.commit" });
  }

  clearProviderBuffer(): boolean {
    this.turnOpen = false;
    this.preRoll.splice(0);
    return this.send({ type: "input_audio_buffer.clear" });
  }

  reset(): void {
    this.turnOpen = false;
    this.preRoll.splice(0);
  }

  private sendAppend(audio: string): boolean {
    return this.send({ type: "input_audio_buffer.append", audio });
  }
}

export interface RealtimePcmCapture {
  stop: () => void;
  sampleRate: number;
}

export async function createRealtimePcmCapture(
  stream: MediaStream,
  onSamples: (samples: Float32Array) => void,
): Promise<RealtimePcmCapture> {
  const browserWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const Context = browserWindow.AudioContext || browserWindow.webkitAudioContext;
  if (!Context) throw new Error("Browser PCM audio capture is unavailable.");
  const context = new Context({ sampleRate: REALTIME_PCM_SAMPLE_RATE });
  if (context.state === "suspended") await context.resume();
  if (context.state !== "running" || context.sampleRate !== REALTIME_PCM_SAMPLE_RATE) {
    await context.close().catch(() => undefined);
    throw new Error("Browser PCM audio capture could not establish the required 24 kHz input contract.");
  }
  if (typeof context.createScriptProcessor !== "function") {
    await context.close().catch(() => undefined);
    throw new Error("Browser PCM audio processing is unavailable.");
  }

  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(REALTIME_PCM_CHUNK_SIZE, 1, 1);
  const silentOutput = context.createGain();
  silentOutput.gain.value = 0;
  let stopped = false;
  processor.onaudioprocess = (event) => {
    if (!stopped) onSamples(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(context.destination);

  return {
    sampleRate: context.sampleRate,
    stop: () => {
      if (stopped) return;
      stopped = true;
      processor.onaudioprocess = null;
      try { source.disconnect(); } catch { /* ignore */ }
      try { processor.disconnect(); } catch { /* ignore */ }
      try { silentOutput.disconnect(); } catch { /* ignore */ }
      void context.close();
    },
  };
}
