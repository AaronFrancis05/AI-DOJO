'use client';
import { AlertCircle, Check, Lightbulb, Sparkles, X } from 'lucide-react';
import type { PendingRetry } from '@/lib/hooks/useRoleplaySession';

interface CorrectionTip { originalText: string; correctedText: string; correctedPhonetic?: string | null; explanation: string; severity: string; }

function SeverityDot({ severity }: { severity: string }) {
  const cls =
    severity === 'major' ? 'bg-dojo-danger' :
    severity === 'moderate' ? 'bg-dojo-warning' :
    'bg-dojo-accent';
  return <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}

export function VoiceCoachPanel({
  corrections, suggestedReplies, retryTarget, onRetry, onDismiss, onPickSuggestion, disabled = false,
}: {
  corrections: CorrectionTip[];
  suggestedReplies: string[];
  retryTarget?: PendingRetry | null;
  onRetry?: () => void;
  onDismiss: () => void;
  onPickSuggestion?: (text: string) => void;
  /**
   * Blocks the actions that send a turn (retry, suggestion chips) while one is
   * in flight or the session has ended — tips linger after the last turn, and
   * a chip clicked then is a turn the server has no session left to accept.
   */
  disabled?: boolean;
}) {
  const hasContent = corrections.length > 0 || suggestedReplies.length > 0 || !!retryTarget;

  return (
    <section className="rounded-2xl border border-dojo-border/70 bg-dojo-surface/95 backdrop-blur-md shadow-xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-dojo-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-dojo-warning" />
          <h3 className="text-sm font-bold text-dojo-text-primary tracking-tight">Coach</h3>
        </div>
        {hasContent && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss coach tips"
            className="flex h-7 w-7 items-center justify-center rounded-full text-dojo-text-muted hover:text-dojo-text-primary hover:bg-white/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!hasContent ? (
        <div className="px-4 py-5 text-center">
          <p className="text-xs text-dojo-text-muted leading-relaxed">
            Your coach listens in on every exchange. Corrections and suggested replies will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3 px-4 py-3">
          {retryTarget && (
            <div className="rounded-xl border border-dojo-accent/30 bg-dojo-accent/10 p-3 space-y-2">
              <p className="text-[11px] font-medium text-dojo-text-muted">Try this instead:</p>
              <p className="text-xs font-medium text-dojo-text-primary leading-relaxed">
                {retryTarget.correctedText}
                {retryTarget.correctedPhonetic ? (
                  <span className="ml-1 italic text-dojo-text-muted">({retryTarget.correctedPhonetic})</span>
                ) : null}
              </p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={disabled}
                  className="flex items-center gap-1.5 rounded-xl bg-dojo-accent px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg shadow-dojo-accent/25 hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:active:scale-100 transition-all"
                >
                  <Check className="h-3.5 w-3.5" />
                  Try this
                </button>
              )}
            </div>
          )}

          {corrections.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-dojo-text-muted">Corrections</p>
              {corrections.map((c, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl border border-dojo-border/40 bg-dojo-surface-raised/70 px-3 py-2.5">
                  <AlertCircle className="h-3.5 w-3.5 text-dojo-warning shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="line-through text-dojo-text-muted">{c.originalText}</span>
                      <span className="text-dojo-text-muted">→</span>
                      <span className="font-medium text-dojo-text-primary">{c.correctedText}</span>
                      <SeverityDot severity={c.severity} />
                    </div>
                    <p className="text-xs text-dojo-text-muted/80 mt-1 leading-relaxed">{c.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {suggestedReplies.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb className="h-3.5 w-3.5 text-dojo-warning" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-dojo-text-muted">You could say</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestedReplies.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onPickSuggestion?.(r)}
                    disabled={disabled}
                    className="rounded-full border border-dojo-border bg-dojo-surface-raised px-2.5 py-1 text-[11px] text-dojo-text-primary hover:border-dojo-accent hover:bg-dojo-accent/10 active:scale-95 disabled:opacity-40 disabled:active:scale-100 transition-all"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}