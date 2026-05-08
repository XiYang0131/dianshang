import "server-only";

import { promises as fs } from "fs";
import path from "path";
import type { Asset } from "@/lib/types";

const PUBLIC_DIR = path.join(process.cwd(), "public");

export function getPublicAssetPath(asset: Asset) {
  if (!asset.url.startsWith("/")) {
    throw new Error("Only local public assets can be read from disk");
  }

  const relativePath = asset.url.replace(/^\//, "");
  const absolutePath = path.resolve(PUBLIC_DIR, relativePath);
  const normalizedPublicDir = path.resolve(PUBLIC_DIR);

  if (!absolutePath.startsWith(normalizedPublicDir)) {
    throw new Error("Invalid asset path");
  }

  return absolutePath;
}

export async function readAssetBlob(asset: Asset) {
  const buffer = await fs.readFile(getPublicAssetPath(asset));
  return new Blob([new Uint8Array(buffer)], {
    type: asset.mimeType || "application/octet-stream"
  });
}

export async function readAssetBuffer(asset: Asset) {
  return fs.readFile(getPublicAssetPath(asset));
}

export async function assetToDataUri(asset: Asset) {
  const buffer = await readAssetBuffer(asset);
  const mimeType = asset.mimeType || "application/octet-stream";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export function getPublicAssetUrl(asset: Asset) {
  if (/^https?:\/\//i.test(asset.url)) return asset.url;

  const publicBaseUrl = process.env.MEDIA_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!publicBaseUrl) return null;

  try {
    return new URL(asset.url, publicBaseUrl).toString();
  } catch {
    return null;
  }
}
