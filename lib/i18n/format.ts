/**
 * The one place dates, times, numbers and money are formatted for display,
 * in the active UI locale. Thin wrappers over Intl so every surface formats
 * the same way; on the client get the locale from useUiLocale().
 *
 * Never pass a learner's TARGET language here — formatting follows the
 * language they read the interface in.
 */

function safeLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? 'en';
  } catch {
    return 'en';
  }
}

export function formatDate(
  value: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(safeLocale(locale), options).format(new Date(value));
}

export function formatTime(
  value: Date | string | number,
  locale: string,
  options: Intl.DateTimeFormatOptions = { timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(safeLocale(locale), options).format(new Date(value));
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(safeLocale(locale), options).format(value);
}

/**
 * Money in `currency` (ISO 4217), formatted for the reader's locale — a
 * tutor's UGX rate reads "UGX 40,000" in English and "40.000 UGX" in German.
 * Converting between currencies is a pricing decision and is not done here.
 */
export function formatCurrency(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(safeLocale(locale), { style: 'currency', currency }).format(amount);
  } catch {
    return `${formatNumber(amount, locale)} ${currency}`;
  }
}

/** "3 days ago", "in 2 hours" — picks the largest whole unit. */
export function formatRelativeTime(value: Date | string | number, locale: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1],
  ];
  const rtf = new Intl.RelativeTimeFormat(safeLocale(locale), { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === 'second') return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'second');
}
