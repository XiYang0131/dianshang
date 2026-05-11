import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { del as deleteBlob, list as listBlobs, put as putBlob } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import type {
  Asset as DatabaseAsset,
  JobStep as DatabaseJobStep,
  Prisma as PrismaTypes
} from "@prisma/client";
import type { Asset, JobStep, ReplacementJob } from "@/lib/types";
import { prisma, shouldUseDatabase } from "@/lib/server/prisma";

type MockDatabase = {
  assets: Asset[];
  jobs: ReplacementJob[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "mock-db.json");
const BLOB_ACCESS = "public";
const ASSET_BLOB_PREFIX = "mock-db/assets";
const JOB_BLOB_PREFIX = "mock-db/jobs";

type DatabaseClient = typeof prisma | PrismaTypes.TransactionClient;
type DatabaseJob = PrismaTypes.JobGetPayload<{
  include: {
    sourceVideo: true;
    outputVideo: true;
    productImages: {
      include: {
        asset: true;
      };
    };
    steps: true;
  };
}>;

function createEmptyDb(): MockDatabase {
  return {
    assets: [],
    jobs: []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonOrNull(value: Record<string, unknown> | undefined) {
  return value === undefined ? Prisma.JsonNull : (value as PrismaTypes.InputJsonValue);
}

function dateOrNull(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateOrNow(value: string | undefined) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function assetFromDatabase(asset: DatabaseAsset): Asset {
  return {
    id: asset.id,
    userId: asset.userId ?? undefined,
    kind: asset.kind,
    url: asset.url,
    filename: asset.filename,
    mimeType: asset.mimeType,
    size: asset.size,
    durationSeconds: asset.durationSeconds ?? undefined,
    metadata: isRecord(asset.metadata) ? asset.metadata : undefined,
    createdAt: asset.createdAt.toISOString()
  };
}

function stepFromDatabase(step: DatabaseJobStep): JobStep {
  return {
    id: step.id,
    name: step.name,
    status: step.status,
    progress: step.progress,
    message: step.message ?? undefined,
    sortOrder: step.sortOrder,
    createdAt: step.createdAt.toISOString(),
    updatedAt: step.updatedAt.toISOString()
  };
}

function normalizeProvider(value: string | null) {
  return value === "mock" || value === "fal" || value === "kling" ? value : undefined;
}

function jobFromDatabase(job: DatabaseJob): ReplacementJob {
  return {
    id: job.id,
    userId: job.userId ?? undefined,
    sourceVideo: assetFromDatabase(job.sourceVideo),
    productImages: job.productImages
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((link) => assetFromDatabase(link.asset)),
    outputVideo: job.outputVideo ? assetFromDatabase(job.outputVideo) : undefined,
    aiProvider: normalizeProvider(job.aiProvider),
    aiProviderJobId: job.aiProviderJobId ?? undefined,
    providerMetadata: isRecord(job.providerMetadata) ? job.providerMetadata : undefined,
    status: job.status,
    progress: job.progress,
    replacementPrompt: job.replacementPrompt,
    selectionBox: job.selectionBox as ReplacementJob["selectionBox"],
    errorMessage: job.errorMessage ?? undefined,
    startedAt: toIsoString(job.startedAt),
    completedAt: toIsoString(job.completedAt),
    estimatedDurationMs: job.estimatedDurationMs,
    steps: job.steps.sort((a, b) => a.sortOrder - b.sortOrder).map(stepFromDatabase),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

async function ensureUser(client: DatabaseClient, userId: string | undefined) {
  if (!userId) return;
  await client.user.upsert({
    where: { id: userId },
    create: { id: userId },
    update: {}
  });
}

async function saveAssetToDatabase(client: DatabaseClient, asset: Asset) {
  const createData = {
    id: asset.id,
    kind: asset.kind,
    url: asset.url,
    filename: asset.filename,
    mimeType: asset.mimeType,
    size: asset.size,
    userId: asset.userId ?? null,
    durationSeconds: asset.durationSeconds ?? null,
    metadata: jsonOrNull(asset.metadata),
    createdAt: dateOrNow(asset.createdAt)
  };

  await client.asset.upsert({
    where: { id: asset.id },
    create: createData,
    update: {
      kind: createData.kind,
      url: createData.url,
      filename: createData.filename,
      mimeType: createData.mimeType,
      size: createData.size,
      userId: createData.userId,
      durationSeconds: createData.durationSeconds,
      metadata: createData.metadata
    }
  });
}

async function getJobFromDatabase(id: string, userId?: string) {
  const job = await prisma.job.findFirst({
    where: {
      id,
      ...(userId ? { userId } : {})
    },
    include: {
      sourceVideo: true,
      outputVideo: true,
      productImages: {
        include: { asset: true },
        orderBy: { sortOrder: "asc" }
      },
      steps: {
        orderBy: { sortOrder: "asc" }
      }
    }
  });
  return job ? jobFromDatabase(job) : null;
}

async function listJobsFromDatabase(userId?: string) {
  const jobs = await prisma.job.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      sourceVideo: true,
      outputVideo: true,
      productImages: {
        include: { asset: true },
        orderBy: { sortOrder: "asc" }
      },
      steps: {
        orderBy: { sortOrder: "asc" }
      }
    }
  });
  return jobs.map(jobFromDatabase);
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

function blobUrlForPath(pathname: string) {
  const [, , , storeId = ""] = (process.env.BLOB_READ_WRITE_TOKEN ?? "").split("_");
  if (!storeId) return null;
  return `https://${storeId}.${BLOB_ACCESS}.blob.vercel-storage.com/${pathname}`;
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
    let blobUrl = blobUrlForPath(pathname);

    if (!blobUrl) {
      const listed = await listBlobs({
        prefix: pathname,
        limit: 10
      });
      const blob = listed.blobs.find((item) => item.pathname === pathname);
      if (!blob) return null;
      blobUrl = blob.url;
    }

    const url = new URL(blobUrl);
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
  if (shouldUseDatabase()) {
    await saveAssetToDatabase(prisma, asset);
    return asset;
  }

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
  if (shouldUseDatabase()) {
    const asset = await prisma.asset.findUnique({ where: { id } });
    return asset ? assetFromDatabase(asset) : null;
  }

  if (shouldUseBlobDb()) {
    return readBlobJson<Asset>(assetBlobPath(id));
  }

  const db = await readDb();
  return db.assets.find((asset) => asset.id === id) ?? null;
}

export async function getAssets(ids: string[]) {
  if (shouldUseDatabase()) {
    const assets = await prisma.asset.findMany({
      where: {
        id: {
          in: ids
        }
      }
    });
    const byId = new Map(assets.map((asset) => [asset.id, assetFromDatabase(asset)]));
    return ids.map((id) => byId.get(id)).filter((asset): asset is Asset => Boolean(asset));
  }

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
  if (shouldUseDatabase()) {
    await prisma.$transaction(async (client) => {
      await ensureUser(client, job.userId);
      await saveAssetToDatabase(client, job.sourceVideo);
      await Promise.all(job.productImages.map((asset) => saveAssetToDatabase(client, asset)));
      if (job.outputVideo) {
        await saveAssetToDatabase(client, job.outputVideo);
      }

      const createData = {
        id: job.id,
        userId: job.userId ?? null,
        sourceVideoId: job.sourceVideo.id,
        outputVideoId: job.outputVideo?.id ?? null,
        status: job.status,
        progress: job.progress,
        replacementPrompt: job.replacementPrompt,
        selectionBox: job.selectionBox as unknown as PrismaTypes.InputJsonValue,
        aiProvider: job.aiProvider ?? null,
        aiProviderJobId: job.aiProviderJobId ?? null,
        providerMetadata: jsonOrNull(job.providerMetadata),
        errorMessage: job.errorMessage ?? null,
        startedAt: dateOrNull(job.startedAt),
        completedAt: dateOrNull(job.completedAt),
        estimatedDurationMs: job.estimatedDurationMs,
        createdAt: dateOrNow(job.createdAt)
      };

      await client.job.upsert({
        where: { id: job.id },
        create: createData,
        update: {
          userId: createData.userId,
          sourceVideoId: createData.sourceVideoId,
          outputVideoId: createData.outputVideoId,
          status: createData.status,
          progress: createData.progress,
          replacementPrompt: createData.replacementPrompt,
          selectionBox: createData.selectionBox,
          aiProvider: createData.aiProvider,
          aiProviderJobId: createData.aiProviderJobId,
          providerMetadata: createData.providerMetadata,
          errorMessage: createData.errorMessage,
          startedAt: createData.startedAt,
          completedAt: createData.completedAt,
          estimatedDurationMs: createData.estimatedDurationMs
        }
      });

      await client.jobProductImage.deleteMany({ where: { jobId: job.id } });
      if (job.productImages.length > 0) {
        await client.jobProductImage.createMany({
          data: job.productImages.map((asset, index) => ({
            jobId: job.id,
            assetId: asset.id,
            sortOrder: index
          }))
        });
      }

      await client.jobStep.deleteMany({ where: { jobId: job.id } });
      if (job.steps.length > 0) {
        await client.jobStep.createMany({
          data: job.steps.map((step) => ({
            id: step.id,
            jobId: job.id,
            name: step.name,
            status: step.status,
            progress: step.progress,
            message: step.message ?? null,
            sortOrder: step.sortOrder,
            createdAt: dateOrNow(step.createdAt)
          }))
        });
      }
    });
    return job;
  }

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

export async function getJobRaw(id: string, userId?: string) {
  if (shouldUseDatabase()) {
    return getJobFromDatabase(id, userId);
  }

  if (shouldUseBlobDb()) {
    const job = await readBlobJson<ReplacementJob>(jobBlobPath(id));
    return !userId || job?.userId === userId ? job : null;
  }

  const db = await readDb();
  const job = db.jobs.find((item) => item.id === id) ?? null;
  return !userId || job?.userId === userId ? job : null;
}

export async function listJobsRaw(userId?: string) {
  if (shouldUseDatabase()) {
    return listJobsFromDatabase(userId);
  }

  if (shouldUseBlobDb()) {
    const jobs = await listBlobJson<ReplacementJob>(`${JOB_BLOB_PREFIX}/`);
    return jobs
      .filter((job) => !userId || job.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const db = await readDb();
  return [...db.jobs]
    .filter((job) => !userId || job.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function deleteJobRaw(id: string, userId?: string) {
  if (shouldUseDatabase()) {
    const deleted = await prisma.job.deleteMany({
      where: {
        id,
        ...(userId ? { userId } : {})
      }
    });
    return deleted.count > 0;
  }

  if (shouldUseBlobDb()) {
    const existing = await getJobRaw(id, userId);
    if (!existing) return false;
    await deleteBlob(jobBlobPath(id));
    return true;
  }

  const db = await readDb();
  const existing = db.jobs.find((job) => job.id === id);
  if (!existing || (userId && existing.userId !== userId)) return false;
  const nextJobs = db.jobs.filter((job) => job.id !== id);
  const deleted = nextJobs.length !== db.jobs.length;
  await writeDb({ ...db, jobs: nextJobs });
  return deleted;
}
