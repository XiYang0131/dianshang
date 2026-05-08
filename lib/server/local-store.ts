import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { list as listBlobs, put as putBlob } from "@vercel/blob";
import type { Asset, ReplacementJob } from "@/lib/types";

type MockDatabase = {
  assets: Asset[];
  jobs: ReplacementJob[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "mock-db.json");
const DB_BLOB_PATH = "mock-db/mock-db.json";
const DB_BLOB_ACCESS = "public";

function createEmptyDb(): MockDatabase {
  return {
    assets: [],
    jobs: []
  };
}

function shouldUseBlobDb() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readDb(): Promise<MockDatabase> {
  if (shouldUseBlobDb()) {
    return readBlobDb();
  }

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
  if (shouldUseBlobDb()) {
    await writeBlobDb(db);
    return;
  }

  if (process.env.VERCEL) {
    throw new Error("Vercel cannot write to local .data. Configure BLOB_READ_WRITE_TOKEN.");
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function normalizeDb(content: string): MockDatabase {
  if (!content.trim()) return createEmptyDb();
  const parsed = JSON.parse(content) as Partial<MockDatabase>;
  return {
    assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    jobs: Array.isArray(parsed.jobs) ? parsed.jobs : []
  };
}

async function readBlobDb(): Promise<MockDatabase> {
  try {
    const listed = await listBlobs({
      prefix: DB_BLOB_PATH,
      limit: 10
    });
    const blob = listed.blobs.find((item) => item.pathname === DB_BLOB_PATH);
    if (!blob) return createEmptyDb();

    const url = new URL(blob.url);
    url.searchParams.set("cache", "0");
    url.searchParams.set("t", String(Date.now()));

    const response = await fetch(url, { cache: "no-store" });
    if (response.status === 404 || response.status === 400) {
      return createEmptyDb();
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch blob database: ${response.status} ${response.statusText}`);
    }

    return normalizeDb(await response.text());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "";
    const lowerMessage = message.toLowerCase();
    if (
      name.includes("NotFound") ||
      lowerMessage.includes("not found") ||
      lowerMessage.includes("failed to fetch blob: 400 bad request")
    ) {
      return createEmptyDb();
    }
    throw new Error(`Blob mock database read failed: ${message}`);
  }
}

async function writeBlobDb(db: MockDatabase) {
  try {
    await putBlob(DB_BLOB_PATH, JSON.stringify(db, null, 2), {
      access: DB_BLOB_ACCESS,
      allowOverwrite: true,
      contentType: "application/json"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Blob mock database write failed: ${message}`);
  }
}

export async function saveAsset(asset: Asset) {
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
  const db = await readDb();
  return db.assets.find((asset) => asset.id === id) ?? null;
}

export async function getAssets(ids: string[]) {
  const db = await readDb();
  return ids
    .map((id) => db.assets.find((asset) => asset.id === id))
    .filter((asset): asset is Asset => Boolean(asset));
}

export async function saveJob(job: ReplacementJob) {
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
  const db = await readDb();
  return db.jobs.find((job) => job.id === id) ?? null;
}

export async function listJobsRaw() {
  const db = await readDb();
  return [...db.jobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deleteJobRaw(id: string) {
  const db = await readDb();
  const nextJobs = db.jobs.filter((job) => job.id !== id);
  const deleted = nextJobs.length !== db.jobs.length;
  await writeDb({ ...db, jobs: nextJobs });
  return deleted;
}
