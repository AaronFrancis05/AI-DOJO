import { redirect } from 'next/navigation';

/**
 * `/auth` used to be the whole thing — one page with a Log in / Register
 * toggle in component state, shared by learners and tutors alike. That toggle
 * is now three pairs of URLs (`/auth/signin`, `/auth/tutor/signin`,
 * `/auth/admin/signin`, and their `signup` twins), so the choice of role is a
 * page you can bookmark, reload and go back to.
 *
 * This is the compatibility shim. Plenty of things still point at `/auth`:
 * the marketing site, the sidebar's sign-out (`?signed_out=1`), the OAuth
 * proxy's failure redirects (`?error=…`), the verification page
 * (`?verified=1`). Every one of those query params is meaningful to the page
 * that now answers, so the whole search string is carried across rather than
 * dropped.
 */
export default async function AuthIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const entry of value) query.append(key, entry);
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }

  const search = query.toString();
  redirect(search ? `/auth/signin?${search}` : '/auth/signin');
}
