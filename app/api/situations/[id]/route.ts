import { db } from '../../../../src/db';
import { situations } from '../../../../src/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numericId = Number(id);
  if (isNaN(numericId)) {
    return Response.json({ success: false, error: 'Invalid situation ID' }, { status: 400 });
  }

  const [situation] = await db.select().from(situations).where(eq(situations.id, numericId));
  if (!situation) {
    return Response.json({ success: false, error: 'Situation not found' }, { status: 404 });
  }

  return Response.json({ success: true, situation });
}
