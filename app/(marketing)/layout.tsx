import { LanguageCatalogProvider } from '@/lib/language-context';
import { UiLocaleNotice } from '@/components/ui/UiLocaleNotice';
import { loadLanguageCatalog } from '@/lib/language-registry';
import { loadUiLocaleContext } from '@/lib/i18n/server';

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The hero's TryoutPanel offers a target/native pair to logged-out visitors,
  // so the public site has to advertise the same catalogue the app enforces —
  // otherwise a visitor picks a language that onboarding then refuses.
  const [languageCatalog, ui] = await Promise.all([loadLanguageCatalog(), loadUiLocaleContext()]);

  return (
    <LanguageCatalogProvider value={languageCatalog} ui={ui}>
      <UiLocaleNotice />
      {children}
    </LanguageCatalogProvider>
  );
}
