import { NextResponse } from "next/server";
import { deleteCurrentSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await deleteCurrentSession();
  return NextResponse.json({ ok: true });
}
