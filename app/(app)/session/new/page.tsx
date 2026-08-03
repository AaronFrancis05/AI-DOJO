/* ───────────────────────────────────────────────
   Deprecated route — session setup now lives inside the
   character-selection dialogue on the situation detail page.
   Redirect for stale links.
   ─────────────────────────────────────────────── */

import { redirect } from 'next/navigation';

export default function SessionNewPage() {
  redirect('/hub');
}
