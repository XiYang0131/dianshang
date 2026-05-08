import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { del as deleteBlob, list as listBlobs, put as putBlob } from "@vercel/blob";
import type { Asset, ReplacementJob } from "@/lib/types";

type MockDatabase = {
  assets: Asset[];
  jobs: ReplacementJob[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "mock-db.json");
const BLOB_ACCESS = "public";
const ASSET_BLOB_PREFIX = "mock-db/assets";
const JOB_BLOB_PREFIX = "mock-db/jobs";

function createEmptyDb(): MockDatabase {
  return {
    assets: [],
    jobs: []
  };
}

function shouldUseBlobDb() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function assetBlobPath(id: string) {
  return `${ASSET_BLOB_PREFIX}/${id}.json`;
}

function jobBlobPath(id: string) {
  return `${JOB_BLOB_PREFIX}/${id}.json`;
}

function isMissingBlobError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const name = error instanceof Error ? error.name : "";
  return (
    name.includes("NotFound") ||
    message.includes("not found") ||
    message.includes("failed to fetch blob: 400 bad request") ||
    message.includes("failed to fetch blob: 404 not found")
  );
}

async function readDb(): Promise<MockDatabase> {
  try {
    const content = await fs.readFile(DB_PATH, "utf8");
    if (!content.trim()) return createEmptyDb();
    const parsed = JSON.parse(content) as Partial<MockDatabase>;
    return {
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyDb();
    }
    throw error;
  }
}

async function writeDb(db: MockDatabase) {
  if (process.env.VERCEL) {
    throw new Error("Vercel cannot write to local .data. Configure BLOB_READ_WRITE_TOKEN.");
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

async function readBlobJson<T extends object>(pathname: string): Promise<T | null> {
  try {
    const listed = await listBlobs({
      prefix: pathname,
      limit: 10
    });
    const blob = listed.blobs.find((item) => item.pathname === pathname);
    if (!blob) return null;

    const url = new URL(blob.url);
    url.searchParams.set("cache", "0");
    url.searchParams.set("t", String(Date.now()));

    const response = await fetch(url, { cache: "no-store" });
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) {
      throw new Error(`Failed to fetch blob JSON: ${response.status} ${response.statusText}`);
    }

    const content = await response.text();
    if (!content.trim()) return null;
    return JSON.parse(content) as T;
  } catch (error) {
    if (isMissingBlobError(error)) return null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Blob read failed for ${pathname}: ${message}`);
  }
}

async function writeBlobJson(pathname: string, value: unknown) {
  try {
    await putBlob(pathname, JSON.stringify(value, null, 2), {
      access: BLOB_ACCESS,
      allowOverwrite: true,
      contentType: "application/json"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Blob write failed for ${pathname}: ${message}`);
  }
}

async function listBlobJson<T extends object>(prefix: string) {
  const values: T[] = [];
  let cursor: string | undefined;

  do {
    const page = await listBlobs({
      prefix,
      cursor,
      limit: 1000
    });
    cursor = page.cursor;
    const pageValues = await Promise.all(page.blobs.map((blob) => readBlobJson<T>(blob.pathname)));
    for (const value of pageValues) {
      if (value) values.push(value);
    }
  } while (cursor);

  return values;
}

export async function saveAsset(asset: Asset) {
  if (shouldUseBlobDb()) {
    await writeBlobJson(assetBlobPath(asset.id), asset);
    return asset;
  }

  const db = await readDb();
  const index = db.assets.findIndex((item) => item.id === asset.id);
  if (index >= 0) {
    db.assets[index] = asset;
  } else {
    db.assets.unshift(asset);
  }
  await writeDb(db);
  return asset;
}

export async function getAsset(id: string) {
  if (shouldUseBlobDb()) {
    return readBlobJson<Asset>(assetBlobPath(id));
  }

  const db = await readDb();
  return db.assets.find((asset) => asset.id === id) ?? null;
}

export async function getAssets(ids: string[]) {
  if (shouldUseBlobDb()) {
    const assets = await Promise.all(ids.map((id) => getAsset(id)));
    return assets.filter((asset): asset is Asset => Boolean(asset));
  }

  const db = await readDb();
  return ids
    .map((id) => db.assets.find((asset) => asset.id === id))
    .filter((asset): asset is Asset => Boolean(asset));
}

export async function saveJob(job: ReplacementJob) {
  if (shouldUseBlobDb()) {
    await writeBlobJson(jobBlobPath(job.id), job);
    return job;
  }

  const db = await readDb();
  const index = db.jobs.findIndex((item) => item.id === job.id);
  if (index >= 0) {
    db.jobs[index] = job;
  } else {
    db.jobs.unshift(job);
  }
  await writeDb(db);
  return job;
}

export async function getJobRaw(id: string) {
  if (shouldUseBlobDb()) {
    return readBlobJson<ReplacementJob>(jobBlobPath(id));
  }

  const db = await readDb();
  return db.jobs.find((job) => job.id === id) ?? null;
}

export async function listJobsRaw() {
  if (shouldUseBlobDb()) {
    const jobs = await listBlobJson<ReplacementJob>(`${JOB_BLOB_PREFIX}/`);
    return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const db = await readDb();
  return [...db.jobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deleteJobRaw(id: string) {
  if (shouldUseBlobDb()) {
    const existing = await getJobRaw(id);
    if (!existing) return false;
    await deleteBlob(jobBlobPath(id));
    return true;
  }

  const db = await readDb();
  const nextJobs = db.jobs.filter((job) => job.id !== id);
  const deleted = nextJobs.length !== db.jobs.length;
  await writeDb({ ...db, jobs: nextJobs });
  return deleted;
}
