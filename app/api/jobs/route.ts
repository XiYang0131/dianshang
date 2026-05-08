import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createJob, createJobSchema, listJobs } from "@/lib/server/job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const input = createJobSchema.parse(payload);
    const job = await createJob(input);
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "请检查视频、商品图、框选区域和替换说明" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建任务失败" },
      { status: 400 }
    );
  }
}
