'use client';

interface GenderPickerProps {
  value: string;
  onChange: (gender: string) => void;
  disabled?: boolean;
}

export function GenderPicker({ value, onChange, disabled }: GenderPickerProps) {
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('female')}
        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
          value === 'female'
            ? 'border-pink-500 bg-pink-500/10 text-pink-400'
            : 'border-dojo-border text-dojo-text-muted hover:border-dojo-text-muted'
        } disabled:opacity-50`}
      >
        ♀ Female
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('male')}
        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
          value === 'male'
            ? 'border-sky-500 bg-sky-500/10 text-sky-400'
            : 'border-dojo-border text-dojo-text-muted hover:border-dojo-text-muted'
        } disabled:opacity-50`}
      >
        ♂ Male
      </button>
    </div>
  );
}
