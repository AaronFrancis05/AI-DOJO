import type { Metadata } from 'next';

/**
 * The admin doors are unlinked and unindexed.
 *
 * Neither of those is the access control — `ADMIN_EMAILS` is (see
 * `lib/auth/admin-allowlist.ts`). This only keeps the pages out of search
 * results and out of the navigation, so the console is not advertised.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
