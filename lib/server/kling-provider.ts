import "server-only";

import type { Asset, ReplacementJob, SelectionBox } from "@/lib/types";
import { assetToDataUri, getPublicAssetUrl } from "@/lib/server/asset-files";
import type { GeneratedVideo, ProviderPollResult } from "@/lib/server/provider-types";

type KlingTaskData = {
  task_id?: string;
  id?: string;
  taskId?: string;
  task_status?: string;
  task_status_msg?: string;
  state?: string;
  status?: string;
  failMsg?: string;
  fail_msg?: string;
  task_result?: {
    videos?: Array<{
      id?: string;
      url?: string;
      duration?: string | number;
    }>;
  };
  resultUrls?: string[];
  result_urls?: string[];
  videos?: Array<{
    id?: string;
    url?: string;
    duration?: string | number;
  }>;
  created_at?: number;
  updated_at?: number;
};

type KlingEnvelope = {
  code?: number;
  message?: string;
  msg?: string;
  request_id?: string;
  data?: KlingTaskData;
  id?: string;
  task_id?: string;
  taskId?: string;
  task_status?: string;
  status?: string;
  object?: string;
  error?: unknown;
};

export type KlingStartResult = {
  provider: "kling";
  taskId: string;
  endpoint: string;
  estimatedDurationMs: number;
  metadata: Record<string, unknown>;
};

function klingApiKey() {
  const apiKey = process.env.KLING_API_KEY || process.env.YUNWU_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 KLING_API_KEY。请在 .env.local 中设置云雾 API Key，并重启 Next.js 服务。");
  }
  return apiKey;
}

function trimSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function baseUrl() {
  return trimSlashes(process.env.KLING_BASE_URL || "https://yunwu.ai");
}

function createPath() {
  return process.env.KLING_CREATE_PATH || "/kling/v1/videos/omni-video";
}

function queryPath(taskId: string) {
  const template = process.env.KLING_QUERY_PATH || `${createPath()}/{task_id}`;
  return template.replace("{task_id}", encodeURIComponent(taskId));
}

function createUrl() {
  return `${baseUrl()}${createPath()}`;
}

function statusUrl(taskId: string) {
  return `${baseUrl()}${queryPath(taskId)}`;
}

function estimatedDurationMs() {
  const fromEnv = Number(process.env.KLING_ESTIMATED_DURATION_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 300000;
}

function mediaModeAllowsDataUri() {
  return boolEnv("KLING_USE_DATA_URI", false);
}

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeDuration(asset: Asset) {
  const fromEnv = process.env.KLING_DURATION;
  if (fromEnv) return fromEnv;

  const duration = asset.durationSeconds ?? 5;
  return String(Math.min(10, Math.max(3, Math.ceil(duration))));
}

function buildRegionPrompt(selectionBox: SelectionBox) {
  return [
    `用户框选的旧商品区域位于第一帧像素坐标 x=${selectionBox.x}, y=${selectionBox.y}, width=${selectionBox.width}, height=${selectionBox.height}。`,
    `归一化区域为 x=${selectionBox.normalizedX}, y=${selectionBox.normalizedY}, width=${selectionBox.normalizedWidth}, height=${selectionBox.normalizedHeight}。`
  ].join(" ");
}

function buildPrompt(job: ReplacementJob, productImageCount: number) {
  return [
    "你是电商短视频商品替换助手。",
    "请基于输入的原视频进行视频编辑，不要重新创作完全不同的视频。",
    "保留原视频中的人物、脸部、手部姿势、背景、镜头运动、光照、阴影、透视关系和视频节奏。",
    "只替换用户框选区域里的旧商品，把它替换成参考商品图中的商品。",
    `共有 ${productImageCount} 张商品参考图，请保持商品外观、颜色、材质和主要结构一致。`,
    buildRegionPrompt(job.selectionBox),
    `商家补充说明：${job.replacementPrompt}`,
    "不要换脸，不要去水印，不要添加仿冒品牌 Logo，不要修改未框选区域。"
  ].join("\n");
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

async function resolveMediaInput(asset: Asset) {
  if (isAbsoluteUrl(asset.url)) return asset.url;

  const configuredPublicUrl = getPublicAssetUrl(asset);
  if (configuredPublicUrl && !configuredPublicUrl.includes("localhost") && !configuredPublicUrl.includes("127.0.0.1")) {
    return configuredPublicUrl;
  }

  if (mediaModeAllowsDataUri()) {
    return assetToDataUri(asset);
  }

  throw new Error(
    "可灵接口需要公网可访问的素材 URL。当前素材只存在本地 public/uploads，云雾服务器访问不到。请配置 MEDIA_PUBLIC_BASE_URL 指向对象存储/CDN，或确认云雾支持 data URI 后再设置 KLING_USE_DATA_URI=true。"
  );
}

function getModelKey() {
  return process.env.KLING_MODEL_FIELD || "model_name";
}

function makeRequestBody(job: ReplacementJob, videoUrl: string, imageUrls: string[]) {
  const body: Record<string, unknown> = {
    prompt: buildPrompt(job, imageUrls.length),
    mode: process.env.KLING_MODE || "pro",
    duration: normalizeDuration(job.sourceVideo),
    video_list: [
      {
        video_url: videoUrl,
        refer_type: process.env.KLING_VIDEO_REFER_TYPE || "base",
        keep_original_sound: process.env.KLING_KEEP_ORIGINAL_SOUND || "yes"
      }
    ],
    image_list: imageUrls.map((imageUrl) => ({
      image_url: imageUrl
    })),
    external_task_id: job.id
  };

  body[getModelKey()] = process.env.KLING_MODEL_NAME || "kling-v3-omni";

  const aspectRatio = process.env.KLING_ASPECT_RATIO;
  if (aspectRatio) body.aspect_ratio = aspectRatio;

  const sound = process.env.KLING_SOUND;
  if (sound) body.sound = sound;

  const cfgScale = process.env.KLING_CFG_SCALE;
  if (cfgScale) body.cfg_scale = numberEnv("KLING_CFG_SCALE", 0.5);

  if (boolEnv("KLING_WATERMARK_DISABLED", true)) {
    body.watermark_info = { enabled: false };
  }

  return body;
}

function assertSuccessfulEnvelope(payload: KlingEnvelope) {
  if (payload.error) {
    throw new Error(typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error));
  }

  if (typeof payload.code === "number" && payload.code !== 0 && payload.code !== 200) {
    throw new Error(payload.message || payload.msg || `可灵接口返回错误 code=${payload.code}`);
  }
}

function getTaskData(payload: KlingEnvelope): KlingTaskData {
  return {
    ...(payload.data ?? {}),
    id: payload.data?.id ?? payload.id,
    task_id: payload.data?.task_id ?? payload.task_id,
    taskId: payload.data?.taskId ?? payload.taskId,
    task_status: payload.data?.task_status ?? payload.task_status,
    status: payload.data?.status ?? payload.status
  };
}

function getTaskId(payload: KlingEnvelope) {
  const data = getTaskData(payload);
  return data.task_id || data.taskId || data.id;
}

function normalizeStatus(data: KlingTaskData) {
  const raw = (data.task_status || data.state || data.status || "").toLowerCase();
  if (["succeed", "success", "completed", "complete", "done"].includes(raw)) return "success";
  if (["failed", "fail", "error", "canceled", "cancelled"].includes(raw)) return "failed";
  return "processing";
}

function mapProgress(job: ReplacementJob, rawStatus: string | undefined) {
  const status = (rawStatus || "").toLowerCase();
  if (status === "submitted" || status === "pending") return Math.max(job.progress, 12);
  const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : Date.now();
  const elapsed = Date.now() - startedAt;
  const estimate = job.estimatedDurationMs || estimatedDurationMs();
  const eased = Math.round(18 + Math.min(elapsed / estimate, 0.95) * 77);
  return Math.max(job.progress, Math.min(eased, 95));
}

function extractVideo(data: KlingTaskData): GeneratedVideo | null {
  const video = data.task_result?.videos?.[0] ?? data.videos?.[0];
  const url = video?.url ?? data.resultUrls?.[0] ?? data.result_urls?.[0];
  if (!url) return null;

  const duration = video?.duration === undefined ? undefined : Number(video.duration);
  return {
    url,
    filename: "kling-generated-video.mp4",
    mimeType: "video/mp4",
    durationSeconds: Number.isFinite(duration) ? duration : undefined,
    metadata: {
      provider: "kling",
      rawVideo: video
    }
  };
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${klingApiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });
  const text = await response.text();
  let payload: KlingEnvelope;
  try {
    payload = text ? (JSON.parse(text) as KlingEnvelope) : {};
  } catch {
    throw new Error(`可灵接口返回了非 JSON 响应：${text.slice(0, 500)}`);
  }

  if (!response.ok) {
    const providerMessage = payload.message || payload.msg;
    const rawText = text.trim();
    const suffix =
      response.status === 503 && mediaModeAllowsDataUri()
        ? "。当前启用了 KLING_USE_DATA_URI=true，云雾可灵的 video_url/image_url 可能不接受 data URI，请改用公网素材 URL。"
        : "";
    throw new Error(
      providerMessage ||
        `${url} 返回 HTTP ${response.status}${rawText ? `：${rawText.slice(0, 300)}` : ""}${suffix}`
    );
  }

  assertSuccessfulEnvelope(payload);
  return payload;
}

export async function submitKlingReplacementJob(job: ReplacementJob): Promise<KlingStartResult> {
  const maxImages = Math.max(1, Math.min(5, numberEnv("KLING_MAX_REFERENCE_IMAGES", 4)));
  const selectedImages = job.productImages.slice(0, maxImages);
  const [videoUrl, ...imageUrls] = await Promise.all([
    resolveMediaInput(job.sourceVideo),
    ...selectedImages.map((asset) => resolveMediaInput(asset))
  ]);
  const requestBody = makeRequestBody(job, videoUrl, imageUrls);
  const payload = await requestJson(createUrl(), {
    method: "POST",
    body: JSON.stringify(requestBody)
  });
  const taskId = getTaskId(payload);

  if (!taskId) {
    throw new Error("可灵任务创建成功但响应里没有 task_id");
  }

  return {
    provider: "kling",
    taskId,
    endpoint: createUrl(),
    estimatedDurationMs: estimatedDurationMs(),
    metadata: {
      endpoint: createUrl(),
      queryEndpoint: statusUrl(taskId),
      taskId,
      requestId: payload.request_id,
      requestBody: {
        ...requestBody,
        video_list: "[media omitted]",
        image_list: `[${imageUrls.length} media item(s) omitted]`
      },
      mediaMode: videoUrl.startsWith("data:") ? "data-uri" : "url",
      omittedProductImages: Math.max(0, job.productImages.length - selectedImages.length)
    }
  };
}

export async function pollKlingReplacementJob(job: ReplacementJob): Promise<ProviderPollResult> {
  const taskId = job.aiProviderJobId;
  if (!taskId) {
    return {
      status: "failed",
      progress: job.progress,
      errorMessage: "可灵任务缺少 task_id"
    };
  }

  try {
    const payload = await requestJson(statusUrl(taskId), {
      method: "GET"
    });
    const data = getTaskData(payload);
    const normalizedStatus = normalizeStatus(data);
    const rawStatus = data.task_status || data.state || data.status;

    if (normalizedStatus === "failed") {
      return {
        status: "failed",
        progress: job.progress,
        errorMessage: data.task_status_msg || data.failMsg || data.fail_msg || payload.message || payload.msg || "可灵任务生成失败",
        metadata: {
          rawStatus,
          payload
        }
      };
    }

    if (normalizedStatus === "success") {
      const output = extractVideo(data);
      if (!output) {
        return {
          status: "failed",
          progress: job.progress,
          errorMessage: "可灵任务已成功，但响应里没有视频 URL",
          metadata: {
            rawStatus,
            payload
          }
        };
      }

      return {
        status: "success",
        progress: 100,
        output: {
          ...output,
          metadata: {
            ...(output.metadata ?? {}),
            taskId,
            requestId: payload.request_id,
            rawStatus
          }
        },
        metadata: {
          rawStatus,
          taskId,
          requestId: payload.request_id
        }
      };
    }

    return {
      status: "processing",
      progress: mapProgress(job, rawStatus),
      metadata: {
        rawStatus,
        taskId,
        requestId: payload.request_id
      }
    };
  } catch (error) {
    return {
      status: "failed",
      progress: job.progress,
      errorMessage: error instanceof Error ? error.message : "可灵任务轮询失败"
    };
  }
}
