import { redirect } from 'next/navigation';

/**
 * `/auth/tutor` used to *be* the tutor application. It is now the pair
 * `/auth/tutor/signin` + `/auth/tutor/signup`, and this keeps every link and
 * bookmark that pointed at the old URL working — the application is the one
 * that was there before.
 */
export default function TutorAuthIndex() {
  redirect('/auth/tutor/signup');
}
