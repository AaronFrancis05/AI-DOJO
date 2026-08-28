import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPcmSink,
  decodePcm16,
  resetCursor,
  isDraining,
  PCM_SAMPLE_RATE,
  type PcmContext,
} from './pcm-player';

/**
 * The two properties that make playback gapless: samples survive chunk
 * boundaries intact, and consecutive utterances are scheduled back-to-back on
 * one cursor rather than each starting from "now".
 */

const EMPTY = new Uint8Array(0);

/** Minimal stand-in for AudioContext; records what was scheduled and when. */
function stubContext(): PcmContext & { now: number; starts: number[]; durations: number[] } {
  const starts: number[] = [];
  const durations: number[] = [];

  const ctx = {
    now: 0,
    starts,
    durations,
    get currentTime() { return ctx.now; },
    createBuffer(_channels: number, length: number, sampleRate: number) {
      return {
        length,
        sampleRate,
        duration: length / sampleRate,
        copyToChannel() { /* samples are not read back in these tests */ },
      } as unknown as AudioBuffer;
    },
    createBufferSource() {
      const source = {
        buffer: null as AudioBuffer | null,
        onended: null,
        start(when: number) {
          starts.push(when);
          durations.push(source.buffer!.duration);
        },
        stop() { /* recorded via live-set removal only */ },
      };
      return source as unknown as AudioBufferSourceNode;
    },
  };

  return ctx as PcmContext & { now: number; starts: number[]; durations: number[] };
}

/** `sampleCount` samples of 16-bit LE PCM, as raw bytes. */
function pcmBytes(sampleCount: number): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(sampleCount * 2));
  for (let i = 0; i < sampleCount; i++) view.setInt16(i * 2, (i % 100) - 50, true);
  return view.buffer;
}

test('decodes 16-bit LE samples into the full-scale float range', () => {
  const view = new DataView(new ArrayBuffer(6));
  view.setInt16(0, 0, true);
  view.setInt16(2, 32767, true);
  view.setInt16(4, -32768, true);

  const { samples, carry } = decodePcm16(new Uint8Array(view.buffer), EMPTY);

  assert.equal(samples.length, 3);
  assert.equal(samples[0], 0);
  assert.ok(Math.abs(samples[1] - 1) < 0.0001);
  // The most negative value maps to exactly -1, so nothing clips.
  assert.equal(samples[2], -1);
  assert.equal(carry.length, 0);
});

test('carries a split sample across a chunk boundary', () => {
  // One sample (0x1234) delivered as two chunks that split it down the middle.
  // Dropping the odd byte would shift every later sample and turn the rest of
  // the utterance into noise.
  const first = decodePcm16(new Uint8Array([0x34]), EMPTY);
  assert.equal(first.samples.length, 0);
  assert.equal(first.carry.length, 1);

  const second = decodePcm16(new Uint8Array([0x12]), first.carry);
  assert.equal(second.samples.length, 1);
  assert.equal(second.carry.length, 0);

  const whole = decodePcm16(new Uint8Array([0x34, 0x12]), EMPTY);
  assert.equal(second.samples[0], whole.samples[0]);
});

test('schedules consecutive blocks with no gap between them', () => {
  resetCursor();
  const ctx = stubContext();
  const sink = createPcmSink(ctx, () => {});

  sink.push(pcmBytes(PCM_SAMPLE_RATE));       // 1.0s
  sink.push(pcmBytes(PCM_SAMPLE_RATE / 2));   // 0.5s

  assert.equal(ctx.starts.length, 2);
  // The second block begins exactly where the first ended.
  assert.equal(ctx.starts[1], ctx.starts[0] + ctx.durations[0]);
});

test('a second utterance butts onto the tail of the first', () => {
  resetCursor();
  const ctx = stubContext();

  const first = createPcmSink(ctx, () => {});
  first.push(pcmBytes(PCM_SAMPLE_RATE * 2)); // 2.0s
  first.end();

  // Synthesis of the next utterance finishes while the first is still audible
  // — that is the whole point of preparing ahead — so the clock has barely
  // moved when the second one starts scheduling.
  ctx.now = 0.4;
  const second = createPcmSink(ctx, () => {});
  second.push(pcmBytes(PCM_SAMPLE_RATE)); // 1.0s

  const firstEnd = ctx.starts[0] + ctx.durations[0];
  assert.equal(ctx.starts[1], firstEnd, 'second utterance must start on the seam');
  // And NOT at "now", which is what a per-utterance player would have done.
  assert.notEqual(ctx.starts[1], ctx.now);

  first.stop();
  second.stop();
});

test('the cursor jumps forward to meet the clock after silence', () => {
  resetCursor();
  const ctx = stubContext();

  const first = createPcmSink(ctx, () => {});
  first.push(pcmBytes(PCM_SAMPLE_RATE)); // 1.0s, scheduled at ~0.05

  // The character fell silent and the learner took a turn; the cursor is now
  // far behind. A block must never be scheduled in the past.
  ctx.now = 30;
  first.end();
  const later = createPcmSink(ctx, () => {});
  later.push(pcmBytes(PCM_SAMPLE_RATE));

  assert.ok(ctx.starts[1] >= ctx.now, 'must not schedule in the past');

  later.stop();
});

test('elapsedMs measures from the sink\'s own first sample', () => {
  resetCursor();
  const ctx = stubContext();
  const sink = createPcmSink(ctx, () => {});

  assert.equal(sink.started, false);
  assert.equal(sink.elapsedMs(), -1);

  sink.push(pcmBytes(PCM_SAMPLE_RATE));
  assert.equal(sink.started, true);

  const startedAt = ctx.starts[0];
  ctx.now = startedAt + 0.25;
  // Azure's viseme audioOffset is measured from the start of this utterance's
  // audio, so this is the clock it has to be walked against.
  assert.ok(Math.abs(sink.elapsedMs() - 250) < 0.001);
});

test('a sink that never received audio finishes immediately', async () => {
  resetCursor();
  const ctx = stubContext();
  const sink = createPcmSink(ctx, () => {});
  sink.end();
  await sink.finished;
});

test('stop resolves a sink that is still mid-flight', async () => {
  resetCursor();
  const ctx = stubContext();
  const sink = createPcmSink(ctx, () => {});
  sink.push(pcmBytes(PCM_SAMPLE_RATE * 10)); // 10s of audio
  sink.end();
  sink.stop();
  await sink.finished;
});

test('isDraining reports whether audio is still due', () => {
  resetCursor();
  const ctx = stubContext();
  const sink = createPcmSink(ctx, () => {});
  sink.push(pcmBytes(PCM_SAMPLE_RATE)); // 1.0s
  assert.equal(isDraining(), true);

  ctx.now = 10;
  assert.equal(isDraining(), false);
});
