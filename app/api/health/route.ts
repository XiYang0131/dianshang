import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const aiProvider = process.env.AI_PROVIDER || "mock";

  return NextResponse.json({
    ok: true,
    runtime: "nodejs",
    vercel: Boolean(process.env.VERCEL),
    aiProvider,
    hasBlobToken,
    hasKlingKey: Boolean(process.env.KLING_API_KEY),
    hasFalKey: Boolean(process.env.FAL_KEY),
    uploadStorage: hasBlobToken ? "vercel-blob" : "local",
    mockDbStorage: hasBlobToken ? "vercel-blob" : "local",
    mockDbStorageVersion: hasBlobToken ? "blob-records-v2" : "local-json",
    klingBaseUrl: process.env.KLING_BASE_URL || null,
    klingCreatePath: process.env.KLING_CREATE_PATH || null
  });
}
