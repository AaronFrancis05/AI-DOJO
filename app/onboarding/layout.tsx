import { OnboardingProvider } from '@/lib/onboarding/context';
import { LanguageCatalogProvider } from '@/lib/language-context';
import { loadLanguageCatalog } from '@/lib/language-registry';
import { loadUiLocaleContext } from '@/lib/i18n/server';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  // Both wizards pick a language from the admin-configured catalogue, so it
  // loads here rather than inside (app). Learner steps require a session
  // (see [step]/layout.tsx); the tutor wizard still renders this layout on
  // the way to its own role gate.
  const [languageCatalog, ui] = await Promise.all([loadLanguageCatalog(), loadUiLocaleContext()]);

  return (
    <LanguageCatalogProvider value={languageCatalog} ui={ui}>
      <OnboardingProvider>{children}</OnboardingProvider>
    </LanguageCatalogProvider>
  );
}
