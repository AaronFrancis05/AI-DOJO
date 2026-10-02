import { OnboardingProvider } from '@/lib/onboarding/context';
import { LanguageCatalogProvider } from '@/lib/language-context';
import { loadLanguageCatalog } from '@/lib/language-registry';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  // Both wizards pick a language from the admin-configured catalogue, so it
  // loads here rather than inside (app). Learner steps require a session
  // (see [step]/layout.tsx); the tutor wizard still renders this layout on
  // the way to its own role gate.
  const languageCatalog = await loadLanguageCatalog();

  return (
    <LanguageCatalogProvider value={languageCatalog}>
      <OnboardingProvider>{children}</OnboardingProvider>
    </LanguageCatalogProvider>
  );
}
