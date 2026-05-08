import { NextResponse } from "next/server";
import { deleteJob, getJob } from "@/lib/server/job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJobWithRetries(id: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const job = await getJob(id);
    if (job) return job;
    if (attempt < 5) await wait(500);
  }
  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const job = await getJobWithRetries(id);
  if (!job) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  return NextResponse.json({ job });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const deleted = await deleteJob(id);
  if (!deleted) {
    return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
