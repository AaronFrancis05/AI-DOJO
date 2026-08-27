/**
 * Microphone → 16-bit PCM frames, for the AI examiner's Live session.
 *
 * Gemini Live wants mono little-endian PCM16 at 16 kHz. The resampling is
 * NOT done here: the caller creates its AudioContext with
 * `{ sampleRate: 16000 }` and lets the browser resample the mic, which is
 * both better and cheaper than anything hand-rolled in an audio thread.
 *
 * A worklet rather than a ScriptProcessorNode: `ScriptProcessorNode` is
 * deprecated and runs on the main thread, where a React re-render lands in
 * the middle of a frame and the examiner hears a click.
 *
 * Frames are batched to 2048 samples (128 ms) before being posted. At the
 * render quantum of 128 samples that would otherwise be ~125 messages a
 * second, each carrying 256 bytes.
 *
 * Served from /public and loaded by URL — `addModule` needs a real script,
 * and a Blob URL would be refused under any Content-Security-Policy worth
 * having.
 */

const FRAME_SAMPLES = 2048;

class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Int16Array(FRAME_SAMPLES);
    this.offset = 0;
    this.sumSquares = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    // No input yet (the track is still starting) is normal, not a reason to
    // tear the processor down — returning false would end it permanently.
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      // Asymmetric on purpose: Int16 runs -32768..32767, so scaling both
      // directions by 32767 wastes a step and scaling both by 32768 clips.
      this.frame[this.offset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.offset += 1;
      this.sumSquares += sample * sample;

      if (this.offset === FRAME_SAMPLES) {
        const copy = new Int16Array(this.frame);
        this.port.postMessage(
          {
            pcm: copy.buffer,
            // RMS, for the "we can hear you" meter. Computed here because the
            // samples are already in hand; recomputing it on the main thread
            // would mean shipping the frame twice.
            level: Math.sqrt(this.sumSquares / FRAME_SAMPLES),
          },
          [copy.buffer],
        );
        this.offset = 0;
        this.sumSquares = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-recorder', PcmRecorder);
