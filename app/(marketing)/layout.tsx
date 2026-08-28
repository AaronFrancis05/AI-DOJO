import { LanguageCatalogProvider } from '@/lib/language-context';
import { loadLanguageCatalog } from '@/lib/language-registry';

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The hero's TryoutPanel offers a target/native pair to logged-out visitors,
  // so the public site has to advertise the same catalogue the app enforces —
  // otherwise a visitor picks a language that onboarding then refuses.
  const languageCatalog = await loadLanguageCatalog();

  return (
    <LanguageCatalogProvider value={languageCatalog}>
      {children}
    </LanguageCatalogProvider>
  );
}
