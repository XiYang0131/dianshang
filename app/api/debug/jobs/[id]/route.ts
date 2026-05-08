import { NextResponse } from "next/server";
import { getJobRaw, listJobsRaw } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const job = await getJobRaw(id);
  const jobs = await listJobsRaw();

  return NextResponse.json({
    ok: true,
    id,
    found: Boolean(job),
    storage: process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local",
    storageVersion: process.env.BLOB_READ_WRITE_TOKEN ? "blob-records-v2" : "local-json",
    jobCount: jobs.length,
    recentJobIds: jobs.slice(0, 10).map((item) => item.id),
    status: job?.status ?? null,
    aiProvider: job?.aiProvider ?? null
  });
}
