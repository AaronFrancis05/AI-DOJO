import { sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { users } from '@/src/schema';
import { requireRole, roleErrorResponse } from '@/lib/auth/server';

export const runtime = 'nodejs';

/**
 * The counts on the admin console's overview.
 *
 * One round trip: every figure is a scalar subquery on a single row, because
 * eight separate `count(*)` queries over an HTTP driver is eight requests, and
 * this renders on every visit to the console.
 */
export async function GET() {
  try {
    await requireRole('admin');
  } catch (err) {
    return roleErrorResponse(err);
  }

  const [row] = await db
    .select({
      learners: sql<number>`(select count(*)::int from users where role = 'learner' and status = 'active')`,
      tutors: sql<number>`(select count(*)::int from users where role = 'tutor' and status = 'active')`,
      admins: sql<number>`(select count(*)::int from users where role = 'admin' and status = 'active')`,
      suspended: sql<number>`(select count(*)::int from users where status <> 'active')`,
      pendingTutors: sql<number>`(select count(*)::int from tutors where verification_status = 'pending')`,
      activeCourses: sql<number>`(select count(*)::int from courses where is_active = true)`,
      activeDomains: sql<number>`(select count(*)::int from domains where is_active = true)`,
      enabledTargetLanguages: sql<number>`(select count(*)::int from languages where is_target_enabled = true)`,
      // "This week" is the next seven days, not the last: an admin looking at
      // an operations overview wants to know what is about to happen.
      upcomingClasses: sql<number>`(
        select count(*)::int from class_sessions
        where status <> 'cancelled'
          and scheduled_at between now() and now() + interval '7 days'
      )`,
      upcomingAssessments: sql<number>`(
        select count(*)::int from assessment_sessions
        where status <> 'cancelled'
          and scheduled_at between now() and now() + interval '7 days'
      )`,
    })
    .from(users)
    .limit(1);

  return Response.json({
    success: true,
    stats: {
      learners: Number(row?.learners ?? 0),
      tutors: Number(row?.tutors ?? 0),
      admins: Number(row?.admins ?? 0),
      suspended: Number(row?.suspended ?? 0),
      pendingTutors: Number(row?.pendingTutors ?? 0),
      activeCourses: Number(row?.activeCourses ?? 0),
      activeDomains: Number(row?.activeDomains ?? 0),
      enabledTargetLanguages: Number(row?.enabledTargetLanguages ?? 0),
      upcomingClasses: Number(row?.upcomingClasses ?? 0),
      upcomingAssessments: Number(row?.upcomingAssessments ?? 0),
    },
  });
}
