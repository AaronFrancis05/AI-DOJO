import { redirect } from 'next/navigation';
import { getUserRoleReadOnly } from '@/lib/auth/server';
import { sanitizeLanguageCode } from '@/lib/tryout/guest-params';

function firstQuery(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const role = await getUserRoleReadOnly();
  if (role === 'tutor') redirect('/onboarding/tutor/welcome');

  const params = await searchParams;
  const qs = new URLSearchParams();
  if (firstQuery(params.preview) === '1') qs.set('preview', '1');
  const target = sanitizeLanguageCode(firstQuery(params.targetLanguage));
  const native = sanitizeLanguageCode(firstQuery(params.nativeLanguage));
  if (target) qs.set('targetLanguage', target);
  if (native) qs.set('nativeLanguage', native);
  const suffix = qs.toString();
  redirect(suffix ? `/onboarding/welcome?${suffix}` : '/onboarding/welcome');
}
