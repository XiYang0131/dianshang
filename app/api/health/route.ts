import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const aiProvider = process.env.AI_PROVIDER || "mock";
  const metadataStorage = hasDatabaseUrl ? "neon-postgres" : hasBlobToken ? "vercel-blob" : "local";
  const metadataStorageVersion = hasDatabaseUrl ? "prisma-postgres-v1" : hasBlobToken ? "blob-records-v2" : "local-json";

  return NextResponse.json({
    ok: true,
    runtime: "nodejs",
    vercel: Boolean(process.env.VERCEL),
    aiProvider,
    hasDatabaseUrl,
    hasBlobToken,
    hasKlingKey: Boolean(process.env.KLING_API_KEY),
    hasFalKey: Boolean(process.env.FAL_KEY),
    uploadStorage: hasBlobToken ? "vercel-blob" : "local",
    metadataStorage,
    metadataStorageVersion,
    mockDbStorage: metadataStorage,
    mockDbStorageVersion: metadataStorageVersion,
    klingBaseUrl: process.env.KLING_BASE_URL || null,
    klingCreatePath: process.env.KLING_CREATE_PATH || null
  });
}
