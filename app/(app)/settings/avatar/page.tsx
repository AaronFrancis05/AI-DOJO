/* ───────────────────────────────────────────────
   Deprecated route — Avatar & Character now opens as a
   dialogue section from /settings. Redirect for stale links.
   ─────────────────────────────────────────────── */

import { redirect } from 'next/navigation';

export default function AvatarSettingsPage() {
  redirect('/settings');
}
