import { db } from '../../../../src/db';
import { scenarios } from '../../../../src/schema';
import { eq } from 'drizzle-orm';

// Note: Ensure the function type maps params as a Promise wrapper matching Next.js specifications
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // 1. Explicitly await the asynchronous params object to unwrap the route ID safely
        const resolvedParams = await params;
        const id = resolvedParams.id;

        if (!id || isNaN(Number(id))) {
            return Response.json({ success: false, error: 'Invalid or missing Scenario ID' }, { status: 400 });
        }

        // 2. Execute database lookup against the safely extracted integer
        const [scenario] = await db
            .select()
            .from(scenarios)
            .where(eq(scenarios.id, Number(id)));

        if (!scenario) {
            return Response.json({ success: false, error: 'Scenario variant missing' }, { status: 404 });
        }

        return Response.json({ success: true, scenario });
    } catch (error) {
        console.error("❌ Failed handling single scenario GET track:", error);
        return Response.json({ success: false, error: 'Internal fetch break' }, { status: 500 });
    }
}