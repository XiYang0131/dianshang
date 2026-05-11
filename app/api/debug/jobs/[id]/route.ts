import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getJobRaw, listJobsRaw } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await getJobRaw(id, user.id);
  const jobs = await listJobsRaw(user.id);
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const storage = hasDatabaseUrl ? "neon-postgres" : process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local";
  const storageVersion = hasDatabaseUrl ? "prisma-postgres-v1" : process.env.BLOB_READ_WRITE_TOKEN ? "blob-records-v2" : "local-json";

  return NextResponse.json({
    ok: true,
    id,
    found: Boolean(job),
    storage,
    storageVersion,
    jobCount: jobs.length,
    recentJobIds: jobs.slice(0, 10).map((item) => item.id),
    status: job?.status ?? null,
    aiProvider: job?.aiProvider ?? null
  });
}
