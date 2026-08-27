# Voice pipeline: mic capture, partial STT, and TTS delivery

## Context

Three symptoms in the roleplay voice loop:

1. **Mic sometimes captures nothing** — press, speak, release, no transcript, no error.
2. **Mic sometimes submits a few words before release** — a half-sentence turn goes to the model.
3. **TTS delivery lags and stutters** — the opening sentence plays, then a pause while the rest is "processed", then the remainder.

The conversation that prompted this assumed the app uses the browser Web Speech API with a server sitting between the mic and Azure. Neither is true, and acting on that advice would be a regression. The real shape is:

- `lib/roleplay/pronunciation.ts` runs the **Azure Speech SDK in the browser**, fed by a session-long AudioWorklet tap through a `PushAudioInputStream`, with the websocket pre-opened and a 300 ms pre-roll. `Speech_SegmentationSilenceTimeoutMs` is already tuned to 350.
- `lib/roleplay/tts.ts` synthesizes **browser-side** too, with `/api/tts` only as a fallback. There is no server hop on the hot path to remove, so GetStream/LiveKit ingest would *add* latency, not cut it.
- Decision taken: **stay on Azure.** Gemini Live emits no visemes (confirmed while building the AI examiner in `lib/interview/`), so migrating would mean re-deriving avatar lip-sync from raw PCM amplitude and losing the 28-language gendered voice map in `lib/language.ts`.

So the causes are local defects, and they are found. Intended outcome: a press always captures or says why it didn't; a release transmits the whole utterance; a reply is spoken as one continuous, gapless stream that starts on the first sentence in **every** language.

---

## What is actually wrong

### Symptom 2 — premature submission (highest confidence, simplest fix)

`onPointerLeave={voice.stop}` is on all five push-to-talk buttons. Sliding a finger or cursor off a 64 px button while still holding fires `pointerleave`, `stop()` runs, and the partial turn transmits. On mobile this happens constantly.

Five copies of the same handler set: [AvatarMicOverlay.tsx:86-92](AI-DOJO/components/roleplay/AvatarMicOverlay.tsx#L86-L92), [session/[sessionId]/voice/page.tsx:624-630](<AI-DOJO/app/(app)/session/[sessionId]/voice/page.tsx#L624-L630>), [session/[sessionId]/avatar/page.tsx:686-692](<AI-DOJO/app/(app)/session/[sessionId]/avatar/page.tsx#L686-L692>), [tryout/voice/page.tsx:246-249](AI-DOJO/app/tryout/voice/page.tsx#L246-L249), [tryout/avatar/page.tsx:253-256](AI-DOJO/app/tryout/avatar/page.tsx#L253-L256).

Secondary: `AvatarMicOverlay`'s auto-stop effect ([AvatarMicOverlay.tsx:48-55](AI-DOJO/components/roleplay/AvatarMicOverlay.tsx#L48-L55)) stops an open mic when `isAiResponding` flips true, and `bargeInRef` only covers the case where it was already true at press time.

### Symptom 2 — dropped tail

- [useVoiceInput.ts:18](AI-DOJO/lib/hooks/useVoiceInput.ts#L18) — `FINAL_FLUSH_GRACE_MS = 250`. Azure's forced final after `stopContinuousRecognitionAsync` routinely lands 400–800 ms later. The wait times out and the code falls back to the last *interim*, which itself trails the audio. The `finalWaiterRef` early-exit at [useVoiceInput.ts:156](AI-DOJO/lib/hooks/useVoiceInput.ts#L156) already ends the wait the instant the final arrives, so a larger cap costs nothing in the common case.
- [pronunciation.ts:293-297](AI-DOJO/lib/roleplay/pronunciation.ts#L293-L297) — `endCapture()` slams the gate shut on release. The last worklet block plus `resampleCarry` never reach the recognizer. There is a 300 ms `PRE_ROLL_MS` at the front and nothing at the back.

### Symptom 1 — silent capture failures

- [pronunciation.ts:501-514](AI-DOJO/lib/roleplay/pronunciation.ts#L501-L514) — on `canceled`, `rebuildRecognizer()` runs but **nothing restarts continuous recognition**. Audio keeps flowing into the new push stream with no recognition session consuming it. The press is silently lost; the *next* press works, because `isRecognizing` is false. This is exactly "sometimes nothing comes out."
- [pronunciation.ts:568-584](AI-DOJO/lib/roleplay/pronunciation.ts#L568-L584) — `closeRecognizer()` nulls `recognizer` but leaves `currentLang` set, and `rebuildRecognizer` does not take the `recognizerPromise` latch. A concurrent `ensureRecognizer` sees `recognizer === null` and builds a **second** recognizer; the global `pushStream` is overwritten and one of them is orphaned.
- [pronunciation.ts:94-118](AI-DOJO/lib/roleplay/pronunciation.ts#L94-L118) — `acquireMicStream` checks `readyState === 'live'` but not `track.muted`. A track can be live-but-muted (another app grabs the device, a Bluetooth route switch). The tap then produces digital silence with no error anywhere.
- [useVoiceInput.ts:232-239](AI-DOJO/lib/hooks/useVoiceInput.ts#L232-L239) — when `buffered` is empty, `stop()` does nothing at all. No callback, no message. Every failure above surfaces to the learner as a dead button.

### Symptom 3 — the mid-reply stall

[tts.ts:925-927](AI-DOJO/lib/roleplay/tts.ts#L925-L927) and [tts.ts:998-1001](AI-DOJO/lib/roleplay/tts.ts#L998-L1001):

```js
function isQueueIdle() { return utteranceQueue.length === 0 && !queuePump; }
...
if (isQueueIdle()) emit();
```

`queuePump` stays non-null for the whole reply. So after the opening sentence is emitted, `isQueueIdle()` is false until the queue fully drains — meaning **nothing else is ever queued mid-reply** unless the group passes `MAX_GROUPED_CHARS` (400), which most replies never do. Everything else waits for `flushStreamTts`, i.e. until generation has finished.

`prepareAhead()` can only prepare items already *in* the queue, so the pipeline it exists to fill is empty precisely when it matters. The audible result is: opening sentence → silence while the model finishes and the remainder is synthesized cold → remainder. That is the reported stutter.

### Symptom 3 — Japanese/Chinese/Korean never stream at all

[sentence-split.ts:14](AI-DOJO/lib/roleplay/sentence-split.ts#L14):

```js
const SENTENCE_BOUNDARY = /[。！？.!?](?=\s|⟧)|\n/g;
```

CJK text does not put a space after `。`. Real output `⟦こんにちは。⟧これは挨拶です。言ってみましょう` finds **no** boundary: the span-internal `。` is skipped, and the one after `です` is followed by `言`, so the lookahead fails. `findSentenceEnd` returns -1 for the entire stream, and the first audio arrives only at `flushStreamTts` — time-to-first-audio equals full generation time. Japanese is the first language in `lib/language.ts`.

The existing test passes only because its fixture ([sentence-split.test.ts:49-53](AI-DOJO/lib/roleplay/sentence-split.test.ts#L49-L53)) has spaces after `。` that real model output does not have.

Thai, Khmer and Burmese (`th`, `km`, `my` in `lib/language.ts`) have no sentence terminators at all and hit the same wall.

### Symptom 3 — the residual seam between clips

Each utterance is its own `SpeakerAudioDestination` → `HTMLAudioElement`, in `Audio24Khz96KBitRateMonoMp3` ([tts.ts:314-315](AI-DOJO/lib/roleplay/tts.ts#L314-L315)). Even fully buffered, resuming an element has a start delay, and MP3 carries encoder delay/padding as silence at each clip head. Cross-utterance seams are audible however well the pipeline is fed.

---

## The plan

### Phase 1 — Push-to-talk input (fixes symptom 2's premature submission)

New `lib/hooks/usePushToTalk.ts`, alongside the existing hooks in `lib/hooks/`. It wraps `useVoiceInput` and returns a props object to spread onto the button, so the handler set exists once instead of five times (AGENTS.md §1, §6 — no second way of doing one thing).

- `onPointerDown` calls `e.currentTarget.setPointerCapture(e.pointerId)` before `start()`. The button then keeps receiving pointer events wherever the finger goes.
- **Drop `onPointerLeave` entirely.** With capture held it is either redundant or wrong; it is the bug.
- Keep `onPointerUp` / `onPointerCancel` / `onKeyUp` / `onBlur` as the release paths — `useVoiceInput.stop()` already ignores all but the first ([useVoiceInput.ts:190-191](AI-DOJO/lib/hooks/useVoiceInput.ts#L190-L191)).
- Guard `onKeyDown` with `e.repeat`.
- Absorb `AvatarMicOverlay`'s barge-in bookkeeping so the auto-stop-on-AI-response effect cannot close a mic the learner is holding: gate it on "not currently held" rather than on `bargeInRef`.

Convert all five call sites to it. Styling and ARIA stay in each component; only the event contract moves.

### Phase 2 — Capture reliability (fixes symptom 1 and symptom 2's dropped tail)

In `lib/roleplay/pronunciation.ts`:

- **Post-roll.** `stopContinuousRecognition()` keeps the gate open for `POST_ROLL_MS` (~250) and flushes `resampleCarry` before `endCapture()`, mirroring `PRE_ROLL_MS`. The release still stops the *transcript* immediately; only the audio already in the pipeline is allowed to land.
- **Restart recognition after a rebuild.** Extract `resumeRecognitionIfCapturing()`; call it at the end of the `canceled` recovery path so a mid-press reconnect keeps transcribing instead of going quiet.
- **Close the rebuild race.** Extract a single `startBuild(lang)` that owns `recognizerPromise` / `pendingLang`; both `ensureRecognizer` and `rebuildRecognizer` go through it. Clear `currentLang` in `closeRecognizer()`.
- **Mic health.** In `acquireMicStream`, reject a track that is `muted` as well as one that is not `live`, and attach `onmute` / `onended` handlers that null `micStream` so the next acquire re-gets the device. Report a mic-lost condition through the existing `onError` callback.

In `lib/hooks/useVoiceInput.ts`:

- Raise `FINAL_FLUSH_GRACE_MS` 250 → 900. The `finalWaiterRef` resolve means a phrase that finalizes promptly still transmits with no added wait; only the case that is currently *broken* pays.
- When a release transmits nothing, set `error` to a plain "No speech detected — hold the button while you speak." All five surfaces already render `voice.error`, so this lands everywhere for free. Clear it on the next `start()`.

`SEGMENTATION_SILENCE_MS` stays at 350 — release-to-transmit already re-joins fragments, and raising it would delay the post-release final.

### Phase 3 — Sentence boundaries (fixes CJK/Thai time-to-first-audio)

In `lib/roleplay/sentence-split.ts`:

```js
// Full-width CJK terminators are unambiguous — there is no "1。5" or "Mr。" —
// and real CJK text never puts a space after them. Only the ASCII terminators
// need the lookahead that stops a chunk boundary being read as a sentence end.
const SENTENCE_BOUNDARY       = /[。！？]|[.!?](?=\s|⟧)|\n/g;
const SENTENCE_BOUNDARY_FINAL = /[。！？]|[.!?](?=\s|⟧|$)|\n/g;
```

Add a length-based fallback for the scriptio-continua languages: when no terminator is found and the buffer exceeds `MAX_UNSPLIT_CHARS` (~160), split at the last whitespace outside a `⟦ ⟧` span. Never splits inside a span — the existing `insideSpan` guard is reused unchanged.

Fix the test fixtures to use realistic unspaced CJK, and add cases for Thai-style unterminated text.

### Phase 4 — Keep the synthesis pipeline full (fixes the mid-reply stall)

In `lib/roleplay/tts.ts`, delete `isQueueIdle()` and emit on pipeline depth instead:

```js
// Hold a group open only while there is already work buffered ahead of the
// voice. An empty queue means the character is about to run out of audio,
// and holding text back at that moment is the stall this replaces.
if (utteranceQueue.length < PREPARE_AHEAD) emit();
```

`prepareAhead()` then genuinely has items to prepare, so utterance N+1 is synthesized while N is speaking — which is what the existing comment at [tts.ts:694-704](AI-DOJO/lib/roleplay/tts.ts#L694-L704) already claims happens.

`MAX_GROUPED_CHARS` stays at 400, so a fast-generating model still groups several sentences into one utterance whenever the pipeline is full.

**Stated trade-off:** this cuts a reply into more utterances than the current design intends, costing some cross-sentence prosody (Azure only carries prosody within an utterance). Phase 5 makes the seams inaudible, which is what makes this trade worth taking.

### Phase 5 — Gapless PCM playback (removes the seam)

New `lib/roleplay/pcm-player.ts` — extracted for the same reason `sentence-split.ts` was: it is testable without the Azure SDK.

It owns a **module-level playback cursor** on the shared `AudioContext` from `getPlaybackContext()`:

- `createPcmSink(ctx, connect)` → `{ push(ArrayBuffer), end(), stop(), elapsedMs(), finished }`.
- `push` converts Int16LE → Float32 (carrying an odd trailing byte across chunks), builds an `AudioBuffer` at 24000 Hz, and schedules a `BufferSource` at the cursor; the cursor then advances by the buffer's duration. Utterance N+1's first block lands exactly where N's last block ended — **gapless by construction, across utterance boundaries**.
- The cursor is floor-clamped to `ctx.currentTime + LEAD_SEC` (~50 ms) so it can never be scheduled in the past.
- `elapsedMs()` = `(ctx.currentTime - startedAt) * 1000`, which is a more accurate viseme clock than `player.currentTime` is today.

In `tts.ts`:

- `getSpeechConfig()` → `Raw24Khz16BitMonoPcm`. (`/api/tts` stays MP3 — `speakViaServer` decodes a complete clip via `decodeAudioData` and is unaffected.)
- `prepareSsmlDirect` builds `new sdk.SpeechSynthesizer(speechConfig, null)` — no speaker output — and collects chunks from `synthesizer.synthesizing`. `prepare` buffers; `play()` hands the buffered chunks to a sink and streams the rest straight through. `visemeReceived` is unchanged; the clock source becomes `sink.elapsedMs()`.
- **Deletions this enables:** `attachToAnalyser`, `routedAudioElements`, the `wantPlay` / `onAudioStart` pause trick, and the whole `DRAIN_TICK_MS` / `STALLED_TICKS` / `NEVER_STARTED_TICKS` watchdog. End of playback becomes exact: synthesis complete **and** cursor reached. Sources connect to `ttsAnalyser` directly, so `holdAnalyser` / `releaseAnalyser` / `getTtsAnalyser` keep working as-is for the lip-sync amplitude fallback.
- `stop()` calls `sink.stop()` on every live source and resets the cursor. The existing three-step fallback chain (direct → `/api/tts` → `speechSynthesis`) in `playQueuedUtterance` is untouched: a browser where the sink cannot be built rejects at `prepare` or `play` and falls through exactly as today.

---

## Files

| File | Change |
|---|---|
| `lib/hooks/usePushToTalk.ts` | **new** — one push-to-talk contract with pointer capture |
| `lib/roleplay/pcm-player.ts` | **new** — gapless PCM scheduler on the shared cursor |
| `lib/roleplay/pcm-player.test.ts` | **new** — Int16→Float32, odd-byte carry, cursor continuity |
| `lib/roleplay/pronunciation.ts` | post-roll, rebuild restart + race, mic-health |
| `lib/hooks/useVoiceInput.ts` | grace 250→900, no-speech feedback |
| `lib/roleplay/sentence-split.ts` | CJK terminators, length fallback |
| `lib/roleplay/sentence-split.test.ts` | realistic unspaced CJK fixtures, Thai case |
| `lib/roleplay/tts.ts` | depth-based emit, PCM config, sink-based `prepareSsmlDirect` |
| 5 mic call sites | adopt `usePushToTalk` (paths listed above) |
| `ui-registry.md`, `MEMORY.md` | register the hook; log the fixes (AGENTS.md §3, §6) |

Not touched: `/api/tts`, `app/api/chat/stream/route.ts` (already correct — `no-transform` + `X-Accel-Buffering: no`, per-token SSE), `lib/language.ts`, `lib/roleplay/reply-speech.ts`.

---

## Verification

**Automated**
- `npm test` — `sentence-split.test.ts` must show a real unspaced Japanese buffer splitting at the first `。` during streaming (this fails before the change), plus the new `pcm-player.test.ts`.
- `npm run lint`.

**Manual, per symptom** — run `npm run dev`, open a session at `/session/[id]/voice` and `/session/[id]/avatar`:

1. *Premature submission*: hold the mic, speak, and **drag the pointer well off the button** mid-sentence before releasing. The mic must stay open and the full sentence must transmit. Repeat on a touch device or Chrome device-emulation.
2. *Dropped tail*: speak a sentence with a deliberate 1-second pause in the middle, release immediately after the last word. The transmitted turn must contain both halves and the final word.
3. *Silent failure*: with the mic held, kill the network for ~3 s to force a `canceled` reconnect — recognition must resume and the turn still transmit. Separately, release without speaking: the "No speech detected" message must appear.
4. *CJK first-audio*: a Japanese session must start speaking on the first `。`, not after the whole reply. Compare `ConnectionLatencyIndicator` (fed by `lib/roleplay/voice-latency.ts`) before and after — expect the largest single improvement here.
5. *Mid-reply stall*: a 4–6 sentence reply must play as one continuous run with no pause at sentence boundaries. Verify in the browser Performance panel that a second `speakSsmlAsync` is in flight while the first is still audible.
6. *Seam*: with `NEXT_PUBLIC_STREAM_TTS=0` (single-clip mode) as the reference, streamed playback should be indistinguishable in continuity.
7. *Fallbacks*: block the Azure synthesis websocket in devtools — playback must degrade to `/api/tts` and then to `speechSynthesis` without a hang.
8. *Lip-sync*: confirm on the avatar tab that the mouth still tracks the voice under the new `elapsedMs()` clock, and that the barge-in reset leaves it closed.
