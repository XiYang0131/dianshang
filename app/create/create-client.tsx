"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MousePointer2,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  Video
} from "lucide-react";
import { FirstFrameAnnotator } from "@/components/first-frame-annotator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { Asset, SelectionBox, UploadResponse, JobResponse } from "@/lib/types";
import { formatFileSize } from "@/lib/utils";

type LocalProductImage = {
  id: string;
  file: File;
  url: string;
};

type VideoFrameResult = {
  dataUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
};

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractFirstFrameFromVideo(file: File): Promise<VideoFrameResult> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    function cleanup() {
      URL.revokeObjectURL(objectUrl);
    }

    function fail(message: string) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    }

    function capture() {
      if (settled) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const context = canvas.getContext("2d");
      if (!context) {
        fail("浏览器无法读取视频第一帧");
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      settled = true;
      cleanup();
      resolve({
        dataUrl: canvas.toDataURL("image/jpeg", 0.86),
        durationSeconds: video.duration,
        width: canvas.width,
        height: canvas.height
      });
    }

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;
    video.onerror = () => fail("无法读取视频，请确认文件为 MP4");
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration)) {
        fail("无法识别视频时长");
        return;
      }
      if (video.duration > 5) {
        fail("当前 MVP 只支持 5 秒以内 MP4 视频");
        return;
      }
    };
    video.onloadeddata = () => {
      const seekTime = Math.min(0.12, Math.max(0, video.duration / 10));
      if (seekTime > 0) {
        video.currentTime = seekTime;
      } else {
        capture();
      }
    };
    video.onseeked = capture;
  });
}

async function uploadAsset(file: File, kind: "source_video" | "product_image", durationSeconds?: number) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);
  if (durationSeconds) {
    formData.append("durationSeconds", String(durationSeconds));
  }

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData
  });
  const payload = (await response.json()) as UploadResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "上传失败");
  }
  return payload.asset;
}

const policyItems = [
  "5 秒以内 MP4",
  "只替换一个物品",
  "必须人工框选",
  "商品图 1 到 5 张",
  "不做换脸、去水印、违规商品"
];

export function CreateClient() {
  const router = useRouter();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [frame, setFrame] = useState<VideoFrameResult | null>(null);
  const [productImages, setProductImages] = useState<LocalProductImage[]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [replacementPrompt, setReplacementPrompt] = useState("");
  const [isPreparingVideo, setIsPreparingVideo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => Boolean(videoFile && frame && productImages.length >= 1 && productImages.length <= 5 && selectionBox && replacementPrompt.trim()),
    [frame, productImages.length, replacementPrompt, selectionBox, videoFile]
  );

  async function handleVideoChange(file?: File) {
    if (!file) return;
    setError(null);
    setSelectionBox(null);
    setFrame(null);
    if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
      setError("请上传 MP4 视频");
      return;
    }

    try {
      setIsPreparingVideo(true);
      const nextPreview = URL.createObjectURL(file);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(nextPreview);
      setVideoFile(file);
      const firstFrame = await extractFirstFrameFromVideo(file);
      setFrame(firstFrame);
    } catch (uploadError) {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      setVideoPreviewUrl(null);
      setVideoFile(null);
      setError(uploadError instanceof Error ? uploadError.message : "视频读取失败");
    } finally {
      setIsPreparingVideo(false);
    }
  }

  function handleProductImages(files?: FileList | null) {
    if (!files) return;
    setError(null);
    const remainingSlots = 5 - productImages.length;
    if (remainingSlots <= 0) {
      setError("商品图最多上传 5 张");
      return;
    }
    const picked = Array.from(files)
      .filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type))
      .slice(0, remainingSlots)
      .map((file) => ({
        id: makeId(),
        file,
        url: URL.createObjectURL(file)
      }));

    if (!picked.length) {
      setError("商品图仅支持 JPG、PNG、WEBP");
      return;
    }
    setProductImages((current) => [...current, ...picked]);
  }

  function removeProductImage(id: string) {
    setProductImages((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  }

  async function handleSubmit() {
    if (!videoFile || !frame || !selectionBox) {
      setError("请先完成视频上传和旧商品框选");
      return;
    }
    if (productImages.length < 1 || productImages.length > 5) {
      setError("请上传 1 到 5 张商品图");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const sourceVideo = await uploadAsset(videoFile, "source_video", frame.durationSeconds);
      const uploadedImages: Asset[] = [];
      for (const image of productImages) {
        uploadedImages.push(await uploadAsset(image.file, "product_image"));
      }

      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceVideoId: sourceVideo.id,
          sourceVideo,
          productImageIds: uploadedImages.map((asset) => asset.id),
          productImages: uploadedImages,
          selectionBox,
          replacementPrompt: replacementPrompt.trim()
        })
      });
      const payload = (await response.json()) as JobResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "创建生成任务失败");
      }
      try {
        sessionStorage.setItem(`job:${payload.job.id}`, JSON.stringify(payload.job));
      } catch {
        // Ignore storage failures. The server copy remains the source of truth.
      }
      router.push(`/jobs/${payload.job.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "创建任务失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container py-8">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Badge variant="outline" className="mb-3 bg-white">
            创建生成任务
          </Badge>
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">上传、框选、生成、预览</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            配置 AI_PROVIDER=kling 或 fal 后会提交真实视频替换任务；未配置时使用本地 mock 流程。
          </p>
        </div>
        <div className="grid grid-cols-4 overflow-hidden rounded-lg border bg-white text-xs text-slate-600">
          {["上传", "框选", "生成", "预览"].map((step, index) => (
            <div key={step} className="border-r px-3 py-2 last:border-r-0">
              <span className="mr-1 font-medium text-slate-950">{index + 1}</span>
              {step}
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <div className="space-y-5">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Video className="h-5 w-5 text-primary" />
                源视频
              </CardTitle>
              <CardDescription>上传 5 秒以内 MP4，系统会读取第一帧。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Label
                htmlFor="video-upload"
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-slate-50 px-4 py-7 text-center hover:bg-slate-100"
              >
                <UploadCloud className="mb-3 h-8 w-8 text-primary" />
                <span className="text-sm font-medium text-slate-950">选择 MP4 视频</span>
                <span className="mt-1 text-xs text-slate-500">当前限制 5 秒以内</span>
              </Label>
              <Input
                id="video-upload"
                type="file"
                accept="video/mp4"
                className="sr-only"
                onChange={(event) => handleVideoChange(event.target.files?.[0])}
              />
              {videoFile ? (
                <div className="rounded-lg border bg-white p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium text-slate-950">{videoFile.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{formatFileSize(videoFile.size)}</span>
                  </div>
                  {frame ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{frame.durationSeconds.toFixed(2)}s</span>
                      <span>{frame.width} x {frame.height}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {videoPreviewUrl ? (
                <video src={videoPreviewUrl} controls className="aspect-video w-full rounded-lg border bg-slate-950 object-contain" />
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ImagePlus className="h-5 w-5 text-primary" />
                商品图
              </CardTitle>
              <CardDescription>上传 1 到 5 张自有商品图片。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Label
                htmlFor="product-upload"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-slate-50 px-4 py-4 text-sm font-medium hover:bg-slate-100"
              >
                <Plus className="h-4 w-4" />
                添加商品图
              </Label>
              <Input
                id="product-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => handleProductImages(event.target.files)}
              />
              <div className="grid grid-cols-3 gap-3">
                {productImages.map((image, index) => (
                  <div key={image.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-slate-100">
                    <img src={image.url} alt={`商品图 ${index + 1}`} className="h-full w-full object-cover" />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute right-1.5 top-1.5 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => removeProductImage(image.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <MousePointer2 className="h-5 w-5 text-primary" />
                第一帧框选
              </CardTitle>
              <CardDescription>只支持一个旧商品区域，请框选得尽量贴合商品边缘。</CardDescription>
            </CardHeader>
            <CardContent>
              {isPreparingVideo ? (
                <div className="flex aspect-video items-center justify-center rounded-lg border bg-white text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在提取第一帧
                </div>
              ) : (
                <FirstFrameAnnotator imageUrl={frame?.dataUrl} onChange={setSelectionBox} />
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="text-xl">替换说明</CardTitle>
              <CardDescription>描述新商品应如何出现在视频里，不要填写违规诉求。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={replacementPrompt}
                onChange={(event) => setReplacementPrompt(event.target.value)}
                placeholder="例如：把框选区域替换成我上传的绿色保温杯，保持人物手持姿势、光照和背景不变。"
              />
              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-950">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  任务限制
                </div>
                <div className="flex flex-wrap gap-2">
                  {policyItems.map((item) => (
                    <Badge key={item} variant="outline" className="bg-white font-normal">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <Separator />
              <Button
                type="button"
                size="lg"
                className="h-12 w-full rounded-md"
                disabled={!canSubmit || isSubmitting}
                onClick={handleSubmit}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                创建生成任务
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
