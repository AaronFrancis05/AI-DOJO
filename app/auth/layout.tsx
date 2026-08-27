import { LanguageCatalogProvider } from '@/lib/language-context';
import { loadLanguageCatalog } from '@/lib/language-registry';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // `/auth/tutor` collects the languages an applicant teaches and explains in,
  // and it does so before they have a session — so the catalogue has to reach
  // the sign-in tree too, not only the app shell.
  const languageCatalog = await loadLanguageCatalog();

  return (
    <LanguageCatalogProvider value={languageCatalog}>
      {children}
    </LanguageCatalogProvider>
  );
}
