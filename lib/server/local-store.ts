import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import type { Asset, ReplacementJob } from "@/lib/types";

type MockDatabase = {
  assets: Asset[];
  jobs: ReplacementJob[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "mock-db.json");
const DB_BLOB_PATH = "mock-db/mock-db.json";

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

async function readBlobDb(): Promise<MockDatabase> {
  const result = await getBlob(DB_BLOB_PATH, {
    access: "private",
    useCache: false
  });

  if (!result || result.statusCode === 304 || !result.stream) {
    return createEmptyDb();
  }

  const content = await new Response(result.stream).text();
  if (!content.trim()) return createEmptyDb();

  const parsed = JSON.parse(content) as Partial<MockDatabase>;
  return {
    assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    jobs: Array.isArray(parsed.jobs) ? parsed.jobs : []
  };
}

async function writeBlobDb(db: MockDatabase) {
  await putBlob(DB_BLOB_PATH, JSON.stringify(db, null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json"
  });
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
