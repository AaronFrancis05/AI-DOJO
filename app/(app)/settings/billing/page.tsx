/* ───────────────────────────────────────────────
   Deprecated route — Pricing & Plans now opens as a
   dialogue section from /settings. Redirect for stale links.
   ─────────────────────────────────────────────── */

import { redirect } from 'next/navigation';

export default function BillingPage() {
  redirect('/settings');
}
