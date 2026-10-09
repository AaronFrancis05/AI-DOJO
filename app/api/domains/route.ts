import { db } from '@/src/db';
import { domains } from '@/src/schema';
import { getUserRole } from '@/lib/auth/server';
import { asc, eq } from 'drizzle-orm';

export async function GET() {
  // Learners only see published domains. Admins get the archived ones too so
  // the Library can show them faded rather than pretending they were deleted.
  const includeArchived = (await getUserRole()) === 'admin';
  const list = await db
    .select()
    .from(domains)
    .where(includeArchived ? undefined : eq(domains.isActive, true))
    .orderBy(asc(domains.displayOrder));

  return Response.json({ success: true, domains: list });
}
