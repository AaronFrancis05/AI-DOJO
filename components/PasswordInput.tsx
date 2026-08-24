'use client';

import { useState, useMemo } from 'react';
import { LockIcon, EyeIcon, EyeOffIcon } from './Icons';

function getStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: 'bg-dojo-border' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const levels = [
    { label: 'Too short', color: 'bg-dojo-danger' },
    { label: 'Weak', color: 'bg-dojo-danger' },
    { label: 'Fair', color: 'bg-dojo-warning' },
    { label: 'Good', color: 'bg-dojo-warning' },
    { label: 'Strong', color: 'bg-dojo-success' },
    { label: 'Very strong', color: 'bg-dojo-success' },
  ];
  return { score, ...levels[Math.min(score, levels.length - 1)] };
}

export default function PasswordInput({
  value,
  onChange,
  placeholder = 'Password',
  autoComplete = 'current-password',
  showStrength = false,
  required = true,
  minLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  showStrength?: boolean;
  required?: boolean;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  const strength = useMemo(() => getStrength(value), [value]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <LockIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dojo-text-muted/60" />
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          className="w-full rounded-lg border border-dojo-border bg-dojo-surface py-3 pl-10 pr-11 text-sm text-dojo-text-primary outline-none transition placeholder:text-dojo-text-muted/50 focus:border-dojo-accent focus:ring-2 focus:ring-dojo-accent/20"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          tabIndex={0}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-dojo-text-muted/60 transition hover:text-dojo-text-primary"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>

      {showStrength && value.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex h-1.5 flex-1 gap-1 overflow-hidden rounded-full">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-full flex-1 rounded-full transition-colors ${
                  i < strength.score ? strength.color : 'bg-dojo-border'
                }`}
              />
            ))}
          </div>
          <span className="w-24 text-right text-xs text-dojo-text-muted">{strength.label}</span>
        </div>
      )}
    </div>
  );
}
