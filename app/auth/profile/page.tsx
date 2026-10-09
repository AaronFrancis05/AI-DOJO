import { redirect } from 'next/navigation';

/** The profile editor moved into the app shell. Keep the old URL working. */
export default function LegacyProfilePage() {
  redirect('/profile');
}
