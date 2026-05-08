import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import type { Asset, AssetKind } from "@/lib/types";
import { saveAsset } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

function sanitizeFilename(filename: string) {
  const cleaned = filename
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
  return cleaned || "asset";
}

function extensionFor(file: File, kind: AssetKind) {
  const lowerName = file.name.toLowerCase();
  const fromName = lowerName.match(/\.[a-z0-9]+$/)?.[0];
  if (fromName) return fromName;
  if (kind === "source_video") return ".mp4";
  if (file.type.includes("png")) return ".png";
  if (file.type.includes("webp")) return ".webp";
  return ".jpg";
}

function assertUploadAllowed(file: File, kind: AssetKind, durationSeconds?: number) {
  if (file.size <= 0) throw new Error("文件为空");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("文件过大，当前上传限制为 80MB");

  if (kind === "source_video") {
    const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
    if (!isMp4) throw new Error("当前 MVP 只支持 MP4 视频");
    if (durationSeconds && durationSeconds > 5) throw new Error("当前 MVP 只支持 5 秒以内视频");
    return;
  }

  if (kind === "product_image") {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      throw new Error("商品图仅支持 JPG、PNG、WEBP");
    }
    return;
  }

  if (kind !== "first_frame") {
    throw new Error("不支持的上传类型");
  }
}

function shouldUseVercelBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function saveToLocal(buffer: Buffer, storedFilename: string) {
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  const filePath = path.join(uploadDir, storedFilename);
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(filePath, buffer);
  return {
    url: `/uploads/${storedFilename}`,
    storage: "local-mock",
    pathname: `uploads/${storedFilename}`
  };
}

async function saveToVercelBlob(file: File, buffer: Buffer, storedFilename: string, kind: AssetKind) {
  const pathname = `uploads/${kind}/${storedFilename}`;
  const blob = await put(pathname, buffer, {
    access: "public",
    contentType: file.type || "application/octet-stream",
    addRandomSuffix: false
  });

  return {
    url: blob.url,
    storage: "vercel-blob",
    pathname: blob.pathname
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = formData.get("kind") as AssetKind | null;
    const duration = formData.get("durationSeconds");
    const durationSeconds = typeof duration === "string" ? Number(duration) : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少上传文件" }, { status: 400 });
    }
    if (!kind) {
      return NextResponse.json({ error: "缺少上传类型" }, { status: 400 });
    }

    assertUploadAllowed(file, kind, Number.isFinite(durationSeconds) ? durationSeconds : undefined);

    const id = randomUUID();
    const safeName = sanitizeFilename(file.name);
    const storedFilename = `${id}-${safeName}${safeName.includes(".") ? "" : extensionFor(file, kind)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = shouldUseVercelBlob()
      ? await saveToVercelBlob(file, buffer, storedFilename, kind)
      : await saveToLocal(buffer, storedFilename);

    const asset: Asset = {
      id,
      kind,
      url: stored.url,
      filename: safeName,
      mimeType: file.type || (kind === "source_video" ? "video/mp4" : "application/octet-stream"),
      size: file.size,
      durationSeconds: kind === "source_video" && Number.isFinite(durationSeconds) ? durationSeconds : undefined,
      metadata: {
        storage: stored.storage,
        pathname: stored.pathname
      },
      createdAt: new Date().toISOString()
    };

    await saveAsset(asset);
    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传失败" },
      { status: 400 }
    );
  }
}
