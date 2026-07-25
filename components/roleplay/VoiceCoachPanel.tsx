'use client';
import { AlertCircle, Lightbulb, X } from 'lucide-react';

interface CorrectionTip { originalText: string; correctedText: string; correctedRomaji?: string | null; explanation: string; severity: string; }

export function VoiceCoachPanel({
  corrections, suggestedReplies, onDismiss, onPickSuggestion,
}: {
  corrections: CorrectionTip[];
  suggestedReplies: string[];
  onDismiss: () => void;
  onPickSuggestion?: (text: string) => void;
}) {
  if (corrections.length === 0 && suggestedReplies.length === 0) return null;
  return (
    <div className="absolute top-20 right-4 left-4 sm:left-auto z-20 w-auto sm:w-72 rounded-2xl border border-dojo-border bg-dojo-surface/95 backdrop-blur-md shadow-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-dojo-text-primary">Coach tips</span>
        <button onClick={onDismiss}><X className="h-3.5 w-3.5 text-dojo-text-muted" /></button>
      </div>
      {corrections.map((c, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <AlertCircle className="h-3.5 w-3.5 text-dojo-warning shrink-0 mt-0.5" />
          <div>
            <span className="line-through text-dojo-text-muted">{c.originalText}</span>
            {' → '}
            <span className="font-medium text-dojo-text-primary">{c.correctedText}</span>
            <p className="text-dojo-text-muted/80 mt-0.5">{c.explanation}</p>
          </div>
        </div>
      ))}
      {suggestedReplies.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb className="h-3.5 w-3.5 text-dojo-warning" />
            <span className="text-[11px] font-medium text-dojo-text-muted">You could say</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestedReplies.map((r, i) => (
              <button key={i} onClick={() => onPickSuggestion?.(r)}
                className="rounded-full border border-dojo-border px-2.5 py-1 text-[11px] text-dojo-text-primary hover:border-dojo-accent">
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
