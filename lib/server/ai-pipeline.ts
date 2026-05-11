import "server-only";

import { randomUUID } from "crypto";
import type { Asset, ReplacementJob, SelectionBox } from "@/lib/types";
import {
  pollFalReplacementJob,
  submitFalReplacementJob
} from "@/lib/server/fal-provider";
import { pollKlingReplacementJob, submitKlingReplacementJob } from "@/lib/server/kling-provider";
import type { AiProvider, GeneratedVideo } from "@/lib/server/provider-types";

export type GenerationStartResult = {
  provider: AiProvider;
  providerJobId: string;
  estimatedDurationMs: number;
  metadata?: Record<string, unknown>;
};

export type GenerationUpdateResult =
  | {
      status: "processing";
      progress: number;
      metadata?: Record<string, unknown>;
    }
  | {
      status: "success";
      progress: 100;
      output: GeneratedVideo;
      metadata?: Record<string, unknown>;
    }
  | {
      status: "failed";
      progress: number;
      errorMessage: string;
      metadata?: Record<string, unknown>;
    };

function activeProvider() {
  if (process.env.AI_PROVIDER === "fal") return "fal";
  if (process.env.AI_PROVIDER === "kling") return "kling";
  return "mock";
}

function mockEstimatedDurationMs() {
  return 28000;
}

export async function validateVideo(asset: Asset) {
  if (asset.kind !== "source_video") {
    throw new Error("请上传源视频文件");
  }
  if (!asset.mimeType.includes("mp4")) {
    throw new Error("当前 MVP 只支持 MP4 视频");
  }
  if (asset.durationSeconds && asset.durationSeconds > 5) {
    throw new Error("当前 MVP 只支持 5 秒以内视频");
  }
  return {
    durationSeconds: asset.durationSeconds ?? null,
    valid: true
  };
}

export async function extractFirstFrame(asset: Asset) {
  return {
    firstFrameUrl: asset.metadata?.firstFrameUrl ?? null,
    mode: "browser-client"
  };
}

export async function createGenerationJob(job: ReplacementJob): Promise<GenerationStartResult> {
  if (activeProvider() === "fal") {
    const submitted = await submitFalReplacementJob(job);
    return {
      provider: "fal",
      providerJobId: submitted.requestId,
      estimatedDurationMs: submitted.estimatedDurationMs,
      metadata: submitted.metadata
    };
  }

  if (activeProvider() === "kling") {
    const submitted = await submitKlingReplacementJob(job);
    return {
      provider: "kling",
      providerJobId: submitted.taskId,
      estimatedDurationMs: submitted.estimatedDurationMs,
      metadata: submitted.metadata
    };
  }

  return {
    provider: "mock",
    providerJobId: `mock-ai-${job.id}`,
    estimatedDurationMs: mockEstimatedDurationMs(),
    metadata: {
      note: "AI_PROVIDER is not set to fal or kling, so the app is using mock generation."
    }
  };
}

export async function callVideoReplacementAPI(input: {
  video: Asset;
  productImages: Asset[];
  selectionBox: SelectionBox;
  prompt: string;
}) {
  return {
    accepted: true,
    provider: activeProvider(),
    sourceVideoUrl: input.video.url,
    productImageCount: input.productImages.length,
    selectionBox: input.selectionBox,
    prompt: input.prompt
  };
}

export async function getGenerationJobUpdate(job: ReplacementJob): Promise<GenerationUpdateResult> {
  if (job.aiProvider === "fal") {
    return pollFalReplacementJob(job);
  }

  if (job.aiProvider === "kling") {
    return pollKlingReplacementJob(job);
  }

  if (!job.startedAt) {
    return {
      status: "processing",
      progress: job.progress
    };
  }

  const elapsed = Date.now() - new Date(job.startedAt).getTime();
  const estimatedDurationMs = job.estimatedDurationMs || mockEstimatedDurationMs();
  const progress = Math.min(Math.max(job.progress, Math.round((elapsed / estimatedDurationMs) * 100)), 100);

  if (progress < 100) {
    return {
      status: "processing",
      progress
    };
  }

  return {
    status: "success",
    progress: 100,
    output: {
      url: job.sourceVideo.url,
      filename: `mock-generated-${job.sourceVideo.filename}`,
      mimeType: job.sourceVideo.mimeType,
      size: job.sourceVideo.size,
      durationSeconds: job.sourceVideo.durationSeconds,
      metadata: {
        mock: true,
        note: "Mock output reuses the uploaded video URL. Set AI_PROVIDER=fal or AI_PROVIDER=kling for real replacement."
      }
    }
  };
}

export async function updateJobProgress(job: ReplacementJob, progress: number) {
  return {
    ...job,
    progress,
    updatedAt: new Date().toISOString()
  };
}

export async function saveOutputVideo(job: ReplacementJob, generated?: GeneratedVideo): Promise<Asset> {
  return {
    id: randomUUID(),
    userId: job.userId,
    kind: "output_video",
    url: generated?.url ?? job.sourceVideo.url,
    filename: generated?.filename ?? `generated-${job.sourceVideo.filename}`,
    mimeType: generated?.mimeType ?? job.sourceVideo.mimeType,
    size: generated?.size ?? job.sourceVideo.size,
    durationSeconds: generated?.durationSeconds ?? job.sourceVideo.durationSeconds,
    metadata: {
      provider: job.aiProvider ?? "mock",
      providerJobId: job.aiProviderJobId,
      ...(generated?.metadata ?? {})
    },
    createdAt: new Date().toISOString()
  };
}
