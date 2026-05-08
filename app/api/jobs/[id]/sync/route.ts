import { NextResponse } from "next/server";
import type { ReplacementJob } from "@/lib/types";
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
    const { id } = await context.params;
    const payload = (await request.json()) as { job?: ReplacementJob };
    if (!payload.job || payload.job.id !== id) {
      return NextResponse.json({ error: "任务快照无效" }, { status: 400 });
    }

    const job = await syncJobSnapshot(payload.job);
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "任务同步失败" },
      { status: 400 }
    );
  }
}
