/**
 * Browser audio for the AI examiner: microphone in, examiner's voice out.
 *
 * Two Web Audio graphs, because the two directions run at different rates and
 * an AudioContext has exactly one. Gemini Live takes 16 kHz PCM16 and returns
 * 24 kHz PCM16, so the capture context is created at 16000 and the playback
 * context at 24000, and the browser's own resampler does the conversion on
 * the way in. Nothing here resamples by hand.
 *
 * Client-only — every symbol touches `window`. Imported from a `'use client'`
 * hook, never from a route.
 */

export const CAPTURE_SAMPLE_RATE = 16_000;
export const PLAYBACK_SAMPLE_RATE = 24_000;

/** The mime type Live expects alongside captured audio. */
export const CAPTURE_MIME_TYPE = `audio/pcm;rate=${CAPTURE_SAMPLE_RATE}`;

const WORKLET_URL = '/worklets/pcm-recorder.js';

/**
 * Base64 for a PCM frame.
 *
 * Chunked because `String.fromCharCode(...bytes)` on a whole buffer spreads
 * every byte as an argument and blows the call stack somewhere around 100 kB.
 */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(data: string): Int16Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  // Copied into an aligned buffer rather than viewed in place: a subarray of
  // a Uint8Array is not guaranteed to start on a 2-byte boundary, and an
  // Int16Array view over an odd offset throws.
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

export interface MicCaptureHandlers {
  /** One ~128 ms frame, already base64 and ready to send. */
  onFrame: (base64: string) => void;
  /** RMS of the same frame, 0..1, for a level meter. */
  onLevel?: (level: number) => void;
}

/** Microphone → PCM16 frames, via the worklet in /public/worklets. */
export class MicCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;

  async start(handlers: MicCaptureHandlers): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        // The examiner hears a room, not a studio. These are the browser's own
        // processors and they are the difference between a usable transcript
        // and one full of the learner's own echoed voice.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.context = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE });
    await this.context.audioWorklet.addModule(WORKLET_URL);

    this.source = this.context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.context, 'pcm-recorder');

    this.node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      handlers.onFrame(toBase64(event.data.pcm));
      handlers.onLevel?.(event.data.level);
    };

    // Connected to the destination as well as the worklet because some
    // browsers will not pull from a graph whose only sink is a worklet. The
    // worklet emits no output, so nothing is actually played back — this does
    // not create an echo.
    this.source.connect(this.node);
    this.node.connect(this.context.destination);
  }

  /** Whether the mic is being sent. Muting stops frames without dropping the track. */
  setMuted(muted: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
  }

  async stop(): Promise<void> {
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect();
      this.node = null;
    }
    this.source?.disconnect();
    this.source = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    if (this.context && this.context.state !== 'closed') {
      await this.context.close().catch(() => {});
    }
    this.context = null;
  }
}

/**
 * The examiner's voice: PCM16 chunks played back gaplessly in arrival order.
 *
 * Chunks are scheduled against the context clock rather than played on
 * arrival, because arrival is bursty and `start()` with no argument would
 * stack them on top of each other.
 */
export class SpeakerQueue {
  private context: AudioContext | null = null;
  private nextStartTime = 0;
  private playing = new Set<AudioBufferSourceNode>();
  private onSpeakingChange?: (speaking: boolean) => void;

  constructor(onSpeakingChange?: (speaking: boolean) => void) {
    this.onSpeakingChange = onSpeakingChange;
  }

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
      this.nextStartTime = 0;
    }
    return this.context;
  }

  /** Browsers require a gesture before audio; call this from the click that starts the interview. */
  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') await context.resume().catch(() => {});
  }

  enqueue(base64Pcm: string): void {
    const context = this.ensureContext();
    const samples = fromBase64(base64Pcm);
    if (samples.length === 0) return;

    const buffer = context.createBuffer(1, samples.length, PLAYBACK_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i] / 0x8000;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    // A little ahead of `currentTime` when the queue has drained, so the first
    // chunk after a pause is not scheduled in the past and dropped.
    const startAt = Math.max(context.currentTime + 0.02, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;

    if (this.playing.size === 0) this.onSpeakingChange?.(true);
    this.playing.add(source);
    source.onended = () => {
      this.playing.delete(source);
      if (this.playing.size === 0) this.onSpeakingChange?.(false);
    };
  }

  /**
   * Drops everything queued.
   *
   * This is what makes barge-in work: Live sends `interrupted` the moment the
   * learner speaks over the examiner, and audio already scheduled would
   * otherwise keep playing over them for as long as the buffer runs.
   */
  interrupt(): void {
    for (const source of this.playing) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already finished between the check and the stop — nothing to do.
      }
    }
    this.playing.clear();
    this.nextStartTime = 0;
    this.onSpeakingChange?.(false);
  }

  async close(): Promise<void> {
    this.interrupt();
    if (this.context && this.context.state !== 'closed') {
      await this.context.close().catch(() => {});
    }
    this.context = null;
  }
}
