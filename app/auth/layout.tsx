import { LanguageCatalogProvider } from '@/lib/language-context';
import { loadLanguageCatalog } from '@/lib/language-registry';
import { loadUiLocaleContext } from '@/lib/i18n/server';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // `/auth/tutor` collects the languages an applicant teaches and explains in,
  // and it does so before they have a session — so the catalogue has to reach
  // the sign-in tree too, not only the app shell.
  const [languageCatalog, ui] = await Promise.all([loadLanguageCatalog(), loadUiLocaleContext()]);

  return (
    <LanguageCatalogProvider value={languageCatalog} ui={ui}>
      {children}
    </LanguageCatalogProvider>
  );
}
