import "server-only";

import { randomUUID } from "crypto";
import { z } from "zod";
import type { Asset, JobStep, ReplacementJob } from "@/lib/types";
import { clamp } from "@/lib/utils";
import type { AiProvider } from "@/lib/server/provider-types";
import {
  callVideoReplacementAPI,
  createGenerationJob,
  extractFirstFrame,
  getGenerationJobUpdate,
  saveOutputVideo,
  updateJobProgress,
  validateVideo
} from "@/lib/server/ai-pipeline";
import { enqueueGenerationJob } from "@/lib/server/queue";
import {
  deleteJobRaw,
  getAsset,
  getAssets,
  getJobRaw,
  listJobsRaw,
  saveAsset,
  saveJob
} from "@/lib/server/local-store";

const DEFAULT_USER_ID = "mock-user";

const assetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["source_video", "product_image", "first_frame", "output_video"]),
  url: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().nonnegative(),
  durationSeconds: z.number().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().min(1)
});

export const createJobSchema = z.object({
  sourceVideoId: z.string().min(1).optional(),
  sourceVideo: assetSchema.optional(),
  productImageIds: z.array(z.string().min(1)).min(1).max(5).optional(),
  productImages: z.array(assetSchema).min(1).max(5).optional(),
  replacementPrompt: z.string().trim().min(2).max(500),
  selectionBox: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
    imageWidth: z.number().positive(),
    imageHeight: z.number().positive(),
    normalizedX: z.number().min(0).max(1),
    normalizedY: z.number().min(0).max(1),
    normalizedWidth: z.number().min(0).max(1),
    normalizedHeight: z.number().min(0).max(1)
  })
}).superRefine((input, context) => {
  if (!input.sourceVideoId && !input.sourceVideo) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceVideoId"],
      message: "source video is required"
    });
  }

  if (!input.productImageIds?.length && !input.productImages?.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["productImageIds"],
      message: "at least one product image is required"
    });
  }
});

function createStep(name: string, sortOrder: number, status: JobStep["status"], message?: string): JobStep {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name,
    status,
    progress: status === "success" ? 100 : 0,
    message,
    sortOrder,
    createdAt: now,
    updatedAt: now
  };
}

function createInitialSteps(provider: AiProvider = "mock"): JobStep[] {
  return [
    createStep("素材校验", 1, "success", "视频、商品图与限制条件已校验"),
    createStep("生成遮罩", 2, "success", "已根据人工框选区域生成替换 mask"),
    createStep(
      "提交任务",
      3,
      "success",
      provider === "fal" ? "真实 AI 任务已提交到 fal.ai" : provider === "kling" ? "真实 AI 任务已提交到云雾可灵" : "mock 任务已提交"
    ),
    createStep(
      "AI 替换生成",
      4,
      "processing",
      provider === "mock" ? "mock 生成任务进行中" : "真实 AI 视频替换进行中"
    ),
    createStep("保存结果", 5, "pending", "等待生成视频")
  ];
}

function assertPolicy(prompt: string) {
  const blockedTerms = ["nsfw", "换脸", "去水印", "水印", "仿冒", "高仿", "违禁", "违法", "logo"];
  const normalized = prompt.toLowerCase();
  const matched = blockedTerms.find((term) => normalized.includes(term.toLowerCase()));
  if (matched) {
    throw new Error(`替换说明包含暂不支持的内容：${matched}`);
  }
}

function updateSteps(
  job: ReplacementJob,
  progress: number,
  status: "processing" | "success" | "failed",
  message?: string
) {
  const now = new Date().toISOString();
  const complete = status === "success";
  const failed = status === "failed";

  return job.steps.map((step) => {
    if (step.sortOrder <= 3) {
      return { ...step, status: "success" as const, progress: 100, updatedAt: now };
    }

    if (step.sortOrder === 4) {
      return {
        ...step,
        status: failed ? ("failed" as const) : complete ? ("success" as const) : ("processing" as const),
        progress: failed ? progress : complete ? 100 : clamp(Math.round(progress * 1.08), 8, 96),
        message:
          message ??
          (failed
            ? "AI 替换生成失败"
            : complete
              ? "AI 替换生成完成"
              : job.aiProvider === "fal" || job.aiProvider === "kling"
                ? "真实 AI 视频替换进行中"
                : "mock 生成任务进行中"),
        updatedAt: now
      };
    }

    return {
      ...step,
      status: failed ? ("failed" as const) : complete ? ("success" as const) : progress >= 88 ? ("processing" as const) : ("pending" as const),
      progress: failed ? 0 : complete ? 100 : progress >= 88 ? clamp((progress - 88) * 8, 8, 90) : 0,
      message: failed ? "未保存结果" : complete ? "结果视频已保存" : "等待生成视频",
      updatedAt: now
    };
  });
}

async function advanceJob(job: ReplacementJob) {
  if (job.status !== "processing") {
    return job;
  }

  const generationUpdate = await getGenerationJobUpdate(job);
  let nextJob = await updateJobProgress(job, generationUpdate.progress);
  const metadata = {
    ...(nextJob.providerMetadata ?? {}),
    ...(generationUpdate.metadata ?? {})
  };

  if (generationUpdate.status === "failed") {
    nextJob = {
      ...nextJob,
      status: "failed",
      progress: generationUpdate.progress,
      errorMessage: generationUpdate.errorMessage,
      providerMetadata: metadata,
      steps: updateSteps(nextJob, generationUpdate.progress, "failed", generationUpdate.errorMessage),
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await saveJob(nextJob);
    return nextJob;
  }

  if (generationUpdate.status === "success") {
    const outputVideo = nextJob.outputVideo ?? (await saveOutputVideo(nextJob, generationUpdate.output));
    if (!nextJob.outputVideo) {
      await saveAsset(outputVideo);
    }

    nextJob = {
      ...nextJob,
      status: "success",
      progress: 100,
      outputVideo,
      providerMetadata: metadata,
      completedAt: nextJob.completedAt ?? new Date().toISOString(),
      steps: updateSteps(nextJob, 100, "success"),
      updatedAt: new Date().toISOString()
    };
    await saveJob(nextJob);
    return nextJob;
  }

  nextJob = {
    ...nextJob,
    status: "processing",
    progress: generationUpdate.progress,
    providerMetadata: metadata,
    steps: updateSteps(nextJob, generationUpdate.progress, "processing"),
    updatedAt: new Date().toISOString()
  };
  await saveJob(nextJob);
  return nextJob;
}

export async function createJob(input: z.infer<typeof createJobSchema>) {
  assertPolicy(input.replacementPrompt);

  const sourceVideo = input.sourceVideo ?? (input.sourceVideoId ? await getAsset(input.sourceVideoId) : null);
  if (!sourceVideo) {
    throw new Error("源视频不存在，请重新上传");
  }
  if (sourceVideo.kind !== "source_video") {
    throw new Error("Source video asset type is invalid.");
  }
  await validateVideo(sourceVideo);
  await extractFirstFrame(sourceVideo);

  const productImages = (input.productImages?.length ? input.productImages : await getAssets(input.productImageIds ?? [])) as Asset[];
  const expectedProductImageCount = input.productImages?.length ?? input.productImageIds?.length ?? 0;
  if (productImages.length !== expectedProductImageCount) {
    throw new Error("部分商品图不存在，请重新上传");
  }
  if (productImages.some((asset) => asset.kind !== "product_image")) {
    throw new Error("商品图素材类型不正确");
  }

  const now = new Date().toISOString();
  let job: ReplacementJob = {
    id: randomUUID(),
    userId: DEFAULT_USER_ID,
    sourceVideo,
    productImages,
    status: "processing",
    progress: 3,
    replacementPrompt: input.replacementPrompt,
    selectionBox: input.selectionBox,
    startedAt: now,
    estimatedDurationMs: 28000,
    steps: createInitialSteps(),
    createdAt: now,
    updatedAt: now
  };

  await callVideoReplacementAPI({
    video: sourceVideo,
    productImages,
    selectionBox: input.selectionBox,
    prompt: input.replacementPrompt
  });

  const generationJob = await createGenerationJob(job);
  job = {
    ...job,
    aiProvider: generationJob.provider,
    aiProviderJobId: generationJob.providerJobId,
    providerMetadata: generationJob.metadata,
    estimatedDurationMs: generationJob.estimatedDurationMs,
    steps: createInitialSteps(generationJob.provider),
    updatedAt: new Date().toISOString()
  };

  await enqueueGenerationJob(job.id);
  await saveJob(job);
  return job;
}

export async function getJob(id: string) {
  const job = await getJobRaw(id);
  if (!job) return null;
  return advanceJob(job);
}

export async function syncJobSnapshot(snapshot: ReplacementJob) {
  const existing = await getJobRaw(snapshot.id);
  const job = await advanceJob(existing ?? snapshot);
  await saveJob(job);
  return job;
}

export async function listJobs() {
  const jobs = await listJobsRaw();
  const advanced = await Promise.all(jobs.map((job) => advanceJob(job)));
  return advanced.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function retryJob(id: string) {
  const current = await getJobRaw(id);
  if (!current) return null;
  const now = new Date().toISOString();
  let retried: ReplacementJob = {
    ...current,
    status: "processing",
    progress: 2,
    outputVideo: undefined,
    errorMessage: undefined,
    aiProviderJobId: undefined,
    providerMetadata: undefined,
    startedAt: now,
    completedAt: undefined,
    steps: createInitialSteps(current.aiProvider ?? "mock"),
    updatedAt: now
  };

  const generationJob = await createGenerationJob(retried);
  retried = {
    ...retried,
    aiProvider: generationJob.provider,
    aiProviderJobId: generationJob.providerJobId,
    providerMetadata: generationJob.metadata,
    estimatedDurationMs: generationJob.estimatedDurationMs,
    steps: createInitialSteps(generationJob.provider),
    updatedAt: new Date().toISOString()
  };

  await enqueueGenerationJob(retried.id);
  await saveJob(retried);
  return retried;
}

export async function deleteJob(id: string) {
  return deleteJobRaw(id);
}
