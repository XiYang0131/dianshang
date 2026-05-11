"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  Video
} from "lucide-react";
import { JobStatusBadge } from "@/components/job-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { JobResponse, ReplacementJob } from "@/lib/types";
import { formatDateTime, formatFileSize } from "@/lib/utils";

function stepDotClass(status: string) {
  if (status === "success") return "bg-emerald-500";
  if (status === "processing") return "bg-cyan-500";
  if (status === "failed") return "bg-red-500";
  return "bg-slate-300";
}

function readCachedJob(id: string) {
  try {
    const cached = sessionStorage.getItem(`job:${id}`);
    return cached ? (JSON.parse(cached) as ReplacementJob) : null;
  } catch {
    return null;
  }
}

function cacheJob(job: ReplacementJob) {
  try {
    sessionStorage.setItem(`job:${job.id}`, JSON.stringify(job));
  } catch {
    // Ignore storage failures.
  }
}

export function JobDetailClient() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [job, setJob] = useState<ReplacementJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(async () => {
    const cachedJob = readCachedJob(id);

    try {
      if (cachedJob?.status === "processing") {
        const syncResponse = await fetch(`/api/jobs/${id}/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ job: cachedJob })
        });
        const syncPayload = (await syncResponse.json()) as JobResponse & { error?: string };
        if (syncResponse.ok) {
          setJob(syncPayload.job);
          cacheJob(syncPayload.job);
          setError(null);
          return;
        }
      }

      const response = await fetch(`/api/jobs/${id}`, {
        cache: "no-store"
      });
      const payload = (await response.json()) as JobResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "任务加载失败");
      setJob(payload.job);
      cacheJob(payload.job);
      setError(null);
    } catch (loadError) {
      if (cachedJob) {
        setJob(cachedJob);
        setError("任务已创建，正在等待服务器记录同步。");
      } else {
        setError(loadError instanceof Error ? loadError.message : "任务加载失败");
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  useEffect(() => {
    if (!job || job.status !== "processing") return;
    const timer = window.setInterval(loadJob, 1200);
    return () => window.clearInterval(timer);
  }, [job, loadJob]);

  async function handleRetry() {
    if (!job) return;
    try {
      setIsRetrying(true);
      const response = await fetch(`/api/jobs/${job.id}/retry`, {
        method: "POST"
      });
      const payload = (await response.json()) as JobResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "重新生成失败");
      setJob(payload.job);
      setError(null);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "重新生成失败");
    } finally {
      setIsRetrying(false);
    }
  }

  if (isLoading) {
    return (
      <div className="container flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载任务
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container py-10">
        <div className="rounded-lg border bg-white p-6 text-sm text-slate-600">
          {error || "任务不存在"}
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-3 h-8 px-2">
            <Link href="/history">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回历史
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950">任务详情</h1>
            <JobStatusBadge status={job.status} />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            创建于 {formatDateTime(job.createdAt)}，任务 ID：{job.id.slice(0, 8)}
            {job.aiProvider ? `，AI 服务：${job.aiProvider}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {job.outputVideo ? (
            <Button asChild className="rounded-md">
              <a href={job.outputVideo.url} download>
                <Download className="mr-2 h-4 w-4" />
                下载视频
              </a>
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="rounded-md"
            disabled={job.status === "processing" || isRetrying}
            onClick={handleRetry}
          >
            {isRetrying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            重新生成
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Sparkles className="h-5 w-5 text-primary" />
                生成进度
              </CardTitle>
              <CardDescription>
                {job.status === "success"
                  ? job.aiProvider === "fal"
                    ? "真实替换结果已生成"
                    : job.aiProvider === "kling"
                      ? "真实替换结果已生成"
                    : "mock 结果已生成"
                  : job.aiProvider === "fal" || job.aiProvider === "kling"
                    ? "真实 AI 视频替换任务进行中"
                    : "任务正在模拟 AI 视频处理"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-950">{job.progress}%</span>
                  <span className="text-slate-500">{job.status === "processing" ? "processing" : job.status}</span>
                </div>
                <Progress value={job.progress} />
              </div>
              <Separator />
              <div className="space-y-4">
                {job.steps
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((step) => (
                    <div key={step.id} className="flex gap-3">
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${stepDotClass(step.status)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium text-slate-950">{step.name}</p>
                          <span className="text-xs text-slate-500">{step.progress}%</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{step.message}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="text-xl">商品图</CardTitle>
              <CardDescription>{job.productImages.length} 张参考图</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {job.productImages.map((asset, index) => (
                  <div key={asset.id} className="overflow-hidden rounded-lg border bg-slate-100">
                    <img src={asset.url} alt={`商品图 ${index + 1}`} className="aspect-square h-full w-full object-cover" />
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
                <Video className="h-5 w-5 text-primary" />
                视频预览
              </CardTitle>
              <CardDescription>
                左侧为源视频，右侧为{job.aiProvider === "fal" || job.aiProvider === "kling" ? "真实 AI 输出视频" : "mock 输出视频"}。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="bg-white">原视频</Badge>
                  <span className="text-xs text-slate-500">{formatFileSize(job.sourceVideo.size)}</span>
                </div>
                <video src={job.sourceVideo.url} controls className="aspect-video w-full rounded-lg border bg-slate-950 object-contain" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="bg-white">生成视频</Badge>
                  <span className="text-xs text-slate-500">{job.outputVideo ? "可下载" : "等待生成"}</span>
                </div>
                {job.outputVideo ? (
                  <video src={job.outputVideo.url} controls className="aspect-video w-full rounded-lg border bg-slate-950 object-contain" />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-lg border bg-slate-100 text-sm text-slate-500">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    生成中
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="text-xl">替换设置</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[1fr_220px]">
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="mb-2 text-xs font-medium uppercase text-slate-500">替换说明</p>
                <p className="text-sm leading-6 text-slate-700">{job.replacementPrompt}</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-4">
                <p className="mb-2 text-xs font-medium uppercase text-slate-500">框选区域</p>
                <div className="space-y-1 text-sm text-slate-700">
                  <p>x: {job.selectionBox.x}</p>
                  <p>y: {job.selectionBox.y}</p>
                  <p>w: {job.selectionBox.width}</p>
                  <p>h: {job.selectionBox.height}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
