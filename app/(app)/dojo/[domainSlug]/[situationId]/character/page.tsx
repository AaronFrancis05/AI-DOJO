/* ───────────────────────────────────────────────
   Deprecated route — character selection now opens as a
   dialogue section from the situation detail page.
   Redirect for stale links.
   ─────────────────────────────────────────────── */

import { redirect } from 'next/navigation';

export default async function CharacterSelectionPage({
  params,
}: {
  params: Promise<{ domainSlug: string; situationId: string }>;
}) {
  const { domainSlug, situationId } = await params;
  redirect(`/dojo/${domainSlug}/${situationId}`);
}
