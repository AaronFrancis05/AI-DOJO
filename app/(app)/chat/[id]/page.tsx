/* ───────────────────────────────────────────────
   Deprecated route — legacy chatroom page. Superseded by
   the immersive session flow at /session/[sessionId].
   Redirect for stale links.
   ─────────────────────────────────────────────── */

import { redirect } from 'next/navigation';

export default function ChatroomPage() {
  redirect('/hub');
}
