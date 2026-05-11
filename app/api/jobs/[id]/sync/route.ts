import { NextResponse } from "next/server";
import type { ReplacementJob } from "@/lib/types";
import { getCurrentUser } from "@/lib/server/auth";
import { syncJobSnapshot } from "@/lib/server/job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Please log in first." }, { status: 401 });
    }

    const { id } = await context.params;
    const payload = (await request.json()) as { job?: ReplacementJob };
    if (!payload.job || payload.job.id !== id) {
      return NextResponse.json({ error: "Invalid job snapshot." }, { status: 400 });
    }

    const job = await syncJobSnapshot(payload.job, user.id);
    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job sync failed." },
      { status: 400 }
    );
  }
}
