import { LanguageCatalogProvider } from '@/lib/language-context';
import { loadLanguageCatalog } from '@/lib/language-registry';

export default async function TryoutLayout({ children }: { children: React.ReactNode }) {
  // The guest preview runs a real roleplay, so it resolves voices and prompts
  // through lib/language.ts exactly as a signed-in session does — and the
  // provider is what hydrates those lookups in the browser.
  const languageCatalog = await loadLanguageCatalog();

  return (
    <LanguageCatalogProvider value={languageCatalog}>
      {children}
    </LanguageCatalogProvider>
  );
}
