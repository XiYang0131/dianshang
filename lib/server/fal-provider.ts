import "server-only";

import { fal } from "@fal-ai/client";
import type { Asset, ReplacementJob } from "@/lib/types";
import { readAssetBlob } from "@/lib/server/asset-files";
import { createSelectionMaskBlob } from "@/lib/server/mask";
import type { GeneratedVideo, ProviderPollResult } from "@/lib/server/provider-types";

const FAL_ENDPOINT = process.env.FAL_MODEL_ID || "fal-ai/wan-vace-14b/inpainting";

type FalVideoFile = {
  url: string;
  file_name?: string;
  content_type?: string;
  file_size?: number;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  num_frames?: number;
};

export type ProviderStartResult = {
  provider: "fal";
  requestId: string;
  endpoint: string;
  estimatedDurationMs: number;
  metadata: Record<string, unknown>;
};

function configureFal() {
  const credentials = process.env.FAL_KEY;
  if (!credentials) {
    throw new Error("缺少 FAL_KEY。请在 .env.local 中设置 FAL_KEY，并重启 Next.js 服务。");
  }
  fal.config({ credentials });
}

function falEstimatedDurationMs() {
  const fromEnv = Number(process.env.FAL_ESTIMATED_DURATION_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 240000;
}

function numericEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function buildPrompt(job: ReplacementJob) {
  return [
    "Replace only the masked product/object with the reference product from the uploaded reference images.",
    "Preserve the person, hands, pose, background, camera motion, lighting, shadows, perspective, and video duration.",
    "Do not change faces, do not remove watermarks, do not add brand logos, and do not edit anything outside the mask.",
    `Merchant instruction: ${job.replacementPrompt}`
  ].join(" ");
}

function buildNegativePrompt() {
  return [
    "face swap",
    "watermark removal",
    "brand logo imitation",
    "nsfw",
    "illegal product",
    "extra object",
    "changed background",
    "changed person",
    "distorted hands",
    "blurred product",
    "low quality"
  ].join(", ");
}

function mapQueueProgress(job: ReplacementJob, status: string) {
  if (status === "IN_QUEUE") return Math.max(job.progress, 12);
  const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : Date.now();
  const elapsed = Date.now() - startedAt;
  const estimate = job.estimatedDurationMs || falEstimatedDurationMs();
  const eased = Math.round(18 + Math.min(elapsed / estimate, 0.95) * 77);
  return Math.max(job.progress, Math.min(eased, 95));
}

async function uploadAsset(asset: Asset) {
  const blob = await readAssetBlob(asset);
  return fal.storage.upload(blob);
}

async function uploadMask(job: ReplacementJob) {
  const maskBlob = await createSelectionMaskBlob(job.selectionBox);
  return fal.storage.upload(maskBlob);
}

export async function submitFalReplacementJob(job: ReplacementJob): Promise<ProviderStartResult> {
  configureFal();

  const [videoUrl, maskImageUrl, ...referenceImageUrls] = await Promise.all([
    uploadAsset(job.sourceVideo),
    uploadMask(job),
    ...job.productImages.map((asset) => uploadAsset(asset))
  ]);

  const input = {
    video_url: videoUrl,
    mask_image_url: maskImageUrl,
    prompt: buildPrompt(job),
    negative_prompt: buildNegativePrompt(),
    ref_image_urls: referenceImageUrls,
    enable_safety_checker: boolEnv("FAL_ENABLE_SAFETY_CHECKER", true),
    enable_prompt_expansion: boolEnv("FAL_ENABLE_PROMPT_EXPANSION", true),
    enable_auto_downsample: true,
    match_input_frames_per_second: true,
    match_input_num_frames: true,
    resolution: process.env.FAL_RESOLUTION || "auto",
    video_quality: process.env.FAL_VIDEO_QUALITY || "high",
    video_write_mode: process.env.FAL_VIDEO_WRITE_MODE || "balanced",
    guidance_scale: numericEnv("FAL_GUIDANCE_SCALE", 5),
    num_inference_steps: numericEnv("FAL_NUM_INFERENCE_STEPS", 30),
    acceleration: process.env.FAL_ACCELERATION || "regular"
  };

  const queued = await fal.queue.submit(FAL_ENDPOINT as never, {
    input: input as never
  });

  return {
    provider: "fal",
    requestId: queued.request_id,
    endpoint: FAL_ENDPOINT,
    estimatedDurationMs: falEstimatedDurationMs(),
    metadata: {
      endpoint: FAL_ENDPOINT,
      requestId: queued.request_id,
      videoUrl,
      maskImageUrl,
      referenceImageUrls,
      queueStatusUrl: queued.status_url,
      queueResponseUrl: queued.response_url
    }
  };
}

export async function pollFalReplacementJob(job: ReplacementJob): Promise<ProviderPollResult> {
  configureFal();

  const requestId = job.aiProviderJobId;
  const endpoint = typeof job.providerMetadata?.endpoint === "string" ? job.providerMetadata.endpoint : FAL_ENDPOINT;

  if (!requestId) {
    return {
      status: "failed",
      progress: job.progress,
      errorMessage: "fal 任务缺少 request id"
    };
  }

  try {
    const status = await fal.queue.status(endpoint, {
      requestId,
      logs: true
    });

    if (status.status !== "COMPLETED") {
      return {
        status: "processing",
        progress: mapQueueProgress(job, status.status),
        metadata: {
          queueStatus: status.status,
          queuePosition: "queue_position" in status ? status.queue_position : undefined,
          logs: "logs" in status ? status.logs?.slice(-5) : undefined
        }
      };
    }

    const result = await fal.queue.result(endpoint as never, {
      requestId
    });
    const data = result.data as { video?: FalVideoFile; prompt?: string; seed?: number };
    const video = data.video;

    if (!video?.url) {
      return {
        status: "failed",
        progress: job.progress,
        errorMessage: "fal 已完成，但响应里没有 output video URL",
        metadata: {
          requestId,
          endpoint,
          rawResult: data
        }
      };
    }

    return {
      status: "success",
      progress: 100,
      output: {
        url: video.url,
        filename: video.file_name,
        mimeType: video.content_type,
        size: video.file_size,
        durationSeconds: video.duration,
        metadata: {
          provider: "fal",
          endpoint,
          requestId,
          seed: data.seed,
          providerPrompt: data.prompt,
          width: video.width,
          height: video.height,
          fps: video.fps,
          numFrames: video.num_frames
        }
      },
      metadata: {
        queueStatus: "COMPLETED",
        requestId,
        endpoint,
        metrics: status.metrics
      }
    };
  } catch (error) {
    return {
      status: "failed",
      progress: job.progress,
      errorMessage: error instanceof Error ? error.message : "fal 任务轮询失败"
    };
  }
}
