import { OnboardingProvider } from '@/lib/onboarding/context';
import { LanguageCatalogProvider } from '@/lib/language-context';
import { loadLanguageCatalog } from '@/lib/language-registry';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  // The wizard's whole job includes picking a target/native pair, so it needs
  // the admin-configured catalogue as much as the signed-in app does — and it
  // runs before there is a session to hang it off.
  const languageCatalog = await loadLanguageCatalog();

  return (
    <LanguageCatalogProvider value={languageCatalog}>
      <OnboardingProvider>{children}</OnboardingProvider>
    </LanguageCatalogProvider>
  );
}
