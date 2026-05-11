import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import type { Asset, AssetKind } from "@/lib/types";
import { getCurrentUser } from "@/lib/server/auth";
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
  if (file.size <= 0) throw new Error("Uploaded file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Uploaded file is too large. The current limit is 80MB.");
  }

  if (kind === "source_video") {
    const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
    if (!isMp4) throw new Error("Only MP4 video is supported.");
    if (durationSeconds && durationSeconds > 5) {
      throw new Error("Only videos up to 5 seconds are supported.");
    }
    return;
  }

  if (kind === "product_image") {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      throw new Error("Product images must be JPG, PNG, or WEBP.");
    }
    return;
  }

  if (kind !== "first_frame") {
    throw new Error("Unsupported upload type.");
  }
}

function shouldUseVercelBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function saveToLocal(buffer: Buffer, storedFilename: string) {
  if (process.env.VERCEL) {
    throw new Error("Vercel cannot write to public/uploads. Configure BLOB_READ_WRITE_TOKEN and redeploy.");
  }

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
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Please log in first." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const kind = formData.get("kind") as AssetKind | null;
    const duration = formData.get("durationSeconds");
    const durationSeconds = typeof duration === "string" ? Number(duration) : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing upload file." }, { status: 400 });
    }
    if (!kind) {
      return NextResponse.json({ error: "Missing upload type." }, { status: 400 });
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
      userId: user.id,
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

    try {
      await saveAsset(asset);
    } catch (saveError) {
      console.warn("Upload asset was stored, but metadata persistence failed", saveError);
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error("Upload failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 }
    );
  }
}
