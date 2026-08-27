/* ───────────────────────────────────────────────
   AiInterviewStage — the learner's side of an AI-examined assessment.

   The counterpart of `CallStage`, and deliberately not built on it: there is
   no Stream call here. An AI interview has one human in it, so the media path
   is browser ↔ Gemini Live and an SFU would relay audio between two endpoints
   that never needed a relay.

   The examiner is a still portrait from the avatar catalogue, per the brief
   ("not avatar so basically a simple image can work") — no 3D rig, no
   lip-sync, nothing that has to load before the learner can be spoken to. It
   is ringed when the examiner is speaking, which is the only animation this
   surface needs to make the turn-taking legible.

   Unlike `CallStage`, this stage follows the app's light/dark themes. The
   video canvas is dark in both because Stream's stylesheet is; there is no
   video here, so there is no reason to make an exception.
   ─────────────────────────────────────────────── */

'use client';

import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAiInterview } from '@/lib/hooks/useAiInterview';
import type { InterviewerPersona } from '@/lib/interview/persona';
import { SCORE_DIMENSIONS } from '@/lib/ai-engine';
import { cn } from '@/lib/design-tokens';
import { Mic, MicOff, Loader2, PhoneOff, Play, RotateCcw, ShieldCheck } from 'lucide-react';

const DIMENSION_LABELS: Record<string, string> = {
  vocabulary: 'Vocabulary',
  grammar: 'Grammar',
  fluency: 'Fluency',
  cultural: 'Cultural fit',
  task: 'Task completion',
  expressionAppropriateness: 'Expression',
};

interface AiInterviewStageProps {
  assessmentId: number;
  interviewer: InterviewerPersona;
  minutesPerLearner: number;
  /** False when the room's own window is shut. */
  canJoin: boolean;
  joinBlockedReason: string | null;
  /** A previous attempt that was already submitted, from the GET. */
  alreadyTaken: boolean;
  /** Called when an interview is submitted, so the page can refresh its result. */
  onSubmitted?: () => void;
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function AiInterviewStage({
  assessmentId,
  interviewer,
  minutesPerLearner,
  canJoin,
  joinBlockedReason,
  alreadyTaken,
  onSubmitted,
}: AiInterviewStageProps) {
  const interview = useAiInterview(assessmentId);
  const { phase, result } = interview;

  // The transcript scrolls itself so the newest line is the one in view — a
  // learner glancing down mid-answer should not have to chase it.
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ block: 'end' });
  }, [interview.transcript, interview.partial]);

  const submittedRef = useRef(false);
  useEffect(() => {
    if (phase === 'complete' && !submittedRef.current) {
      submittedRef.current = true;
      onSubmitted?.();
    }
  }, [phase, onSubmitted]);

  const live = phase === 'live';
  const busy = phase === 'starting' || phase === 'finishing';
  const blocked = !canJoin && phase === 'idle';

  return (
    <div className="space-y-4">
      <Card className="!p-0">
        <div className="flex flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:items-start sm:gap-6">
          <div
            className={cn(
              'relative shrink-0 rounded-full p-1 transition-colors',
              interview.examinerSpeaking ? 'bg-dojo-accent' : 'bg-dojo-border',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- catalogue portrait, fixed local asset */}
            <img
              src={interviewer.imageSrc}
              alt={interviewer.name}
              className="h-24 w-24 rounded-full object-cover"
            />
            {interview.examinerSpeaking && (
              <span className="absolute inset-0 animate-ping rounded-full border-2 border-dojo-accent motion-reduce:animate-none" />
            )}
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h2 className="text-lg font-bold leading-none tracking-tight text-dojo-text-primary">
                {interviewer.name}
              </h2>
              <Badge variant={live ? 'accent' : 'outline'}>
                {live ? 'Examining' : phase === 'complete' ? 'Finished' : 'AI examiner'}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
              {interviewer.role}
            </p>

            {phase === 'idle' && !alreadyTaken && (
              <p className="mt-4 text-sm leading-relaxed text-dojo-text-primary">
                {interviewer.name} will speak with you for about {minutesPerLearner} minutes and
                ask a few questions. Answer out loud — you will not get feedback during the
                examination, only afterwards.
              </p>
            )}

            {live && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
                <span className="flex items-center gap-2 text-sm tabular-nums text-dojo-text-primary">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full bg-dojo-accent"
                    aria-hidden
                  />
                  {interview.secondsLeft != null ? formatClock(interview.secondsLeft) : '—'} left
                </span>
                <span className="flex items-center gap-2 text-sm text-dojo-text-muted">
                  {interview.muted ? (
                    <MicOff className="h-4 w-4 shrink-0 text-dojo-danger" />
                  ) : (
                    <Mic className="h-4 w-4 shrink-0" />
                  )}
                  <span className="flex h-4 w-16 items-end gap-0.5" aria-hidden>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((bar) => (
                      <span
                        key={bar}
                        className={cn(
                          'w-1.5 rounded-sm transition-all',
                          !interview.muted && interview.micLevel * 12 > bar / 2
                            ? 'h-full bg-dojo-accent'
                            : 'h-1 bg-dojo-border',
                        )}
                      />
                    ))}
                  </span>
                  <span className="sr-only">
                    {interview.muted ? 'Microphone muted' : 'Microphone live'}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-dojo-border px-6 py-4">
          {phase === 'idle' && (
            <Button variant="primary" disabled={blocked || alreadyTaken} onClick={interview.start}>
              <Play className="h-4 w-4" /> Start the examination
            </Button>
          )}
          {phase === 'error' && (
            <Button variant="primary" onClick={interview.start}>
              <RotateCcw className="h-4 w-4" /> Try again
            </Button>
          )}
          {busy && (
            <span className="flex items-center gap-2 text-sm text-dojo-text-muted">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              {phase === 'starting' ? 'Connecting you…' : 'Marking your examination…'}
            </span>
          )}
          {live && (
            <>
              <Button variant="secondary" onClick={interview.toggleMute}>
                {interview.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {interview.muted ? 'Unmute' : 'Mute'}
              </Button>
              <Button variant="danger" onClick={interview.finish}>
                <PhoneOff className="h-4 w-4" /> End and submit
              </Button>
            </>
          )}
          {blocked && joinBlockedReason && (
            <p className="text-sm text-dojo-text-muted">{joinBlockedReason}</p>
          )}
          {alreadyTaken && phase === 'idle' && (
            <p className="text-sm text-dojo-text-muted">You have already sat this examination.</p>
          )}
        </div>
      </Card>

      {interview.error && <p className="text-sm text-dojo-danger">{interview.error}</p>}

      {(live || interview.transcript.length > 0) && (
        <Card className="!p-0">
          <h3 className="border-b border-dojo-border px-4 py-3 text-xs font-bold uppercase tracking-widest text-dojo-text-muted">
            Transcript
          </h3>
          <div className="max-h-96 space-y-3 overflow-y-auto p-4">
            {interview.transcript.map((turn, index) => (
              <p
                key={`${turn.at}-${index}`}
                className={cn(
                  'text-sm leading-relaxed',
                  turn.speaker === 'examiner'
                    ? 'text-dojo-text-primary'
                    : 'text-dojo-text-muted',
                )}
              >
                <span className="font-semibold">
                  {turn.speaker === 'examiner' ? interviewer.name : 'You'}:{' '}
                </span>
                {turn.text}
              </p>
            ))}
            {interview.partial && (
              <p className="text-sm leading-relaxed text-dojo-text-muted opacity-70">
                <span className="font-semibold">
                  {interview.partial.speaker === 'examiner' ? interviewer.name : 'You'}:{' '}
                </span>
                {interview.partial.text}
              </p>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </Card>
      )}

      {phase === 'complete' && result && (
        <Card className="!p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-dojo-text-primary">
            <ShieldCheck className="h-4 w-4 shrink-0 text-dojo-accent" />
            {result.graded ? 'Your result' : 'Recorded'}
          </h3>

          {result.graded && result.scores ? (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {SCORE_DIMENSIONS.map((dimension) => (
                  <div key={dimension}>
                    <dt className="text-xs text-dojo-text-muted">{DIMENSION_LABELS[dimension]}</dt>
                    <dd className="text-lg font-bold tabular-nums leading-none text-dojo-text-primary">
                      {result.scores?.[dimension] ?? 0}
                      <span className="text-xs font-normal text-dojo-text-muted"> / 100</span>
                    </dd>
                  </div>
                ))}
              </dl>
              {result.feedback && (
                <p className="mt-4 text-sm leading-relaxed text-dojo-text-primary">
                  {result.feedback}
                </p>
              )}
              <p className="mt-4 text-xs leading-relaxed text-dojo-text-muted">
                This is the AI examiner&apos;s verdict. Your tutor sees the same transcript and may
                mark it themselves — both appear on your course grades.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">
              {result.learnerTurns === 0
                ? 'Nothing was recorded from your side, so there was nothing to mark. Speak to your tutor.'
                : 'Your examination was recorded but could not be marked automatically. Your tutor will review the transcript.'}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
