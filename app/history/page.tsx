"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  Eye,
  Loader2,
  PlusCircle,
  Trash2
} from "lucide-react";
import { JobStatusBadge } from "@/components/job-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { JobsResponse, ReplacementJob } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export default function HistoryPage() {
  const [jobs, setJobs] = useState<ReplacementJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasProcessingJobs = useMemo(() => jobs.some((job) => job.status === "processing"), [jobs]);

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs", {
        cache: "no-store"
      });
      const payload = (await response.json()) as JobsResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "历史记录加载失败");
      setJobs(payload.jobs);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "历史记录加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!hasProcessingJobs) return;
    const timer = window.setInterval(loadJobs, 1600);
    return () => window.clearInterval(timer);
  }, [hasProcessingJobs, loadJobs]);

  async function deleteJob(id: string) {
    try {
      setDeletingId(id);
      const response = await fetch(`/api/jobs/${id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "删除失败");
      }
      setJobs((current) => current.filter((job) => job.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="container py-8">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Badge variant="outline" className="mb-3 bg-white">
            历史记录
          </Badge>
          <h1 className="text-3xl font-semibold tracking-normal text-slate-950">生成任务列表</h1>
          <p className="mt-2 text-sm text-slate-500">查看、下载、删除已创建的商品替换任务。</p>
        </div>
        <Button asChild className="rounded-md">
          <Link href="/create">
            <PlusCircle className="mr-2 h-4 w-4" />
            创建任务
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center rounded-lg border bg-white text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载历史记录
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border bg-white p-8 text-center">
          <p className="text-base font-medium text-slate-950">还没有生成任务</p>
          <p className="mt-2 text-sm text-slate-500">上传一个短视频，完成框选后即可创建第一条任务。</p>
          <Button asChild className="mt-5 rounded-md">
            <Link href="/create">
              <PlusCircle className="mr-2 h-4 w-4" />
              创建任务
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => (
            <Card key={job.id} className="rounded-lg shadow-none">
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <CardTitle className="truncate text-lg">
                    {job.sourceVideo.filename}
                  </CardTitle>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{formatDateTime(job.createdAt)}</span>
                    <span>{job.productImages.length} 张商品图</span>
                    <span>ID {job.id.slice(0, 8)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <JobStatusBadge status={job.status} />
                  <Button asChild variant="outline" size="sm" className="h-9 rounded-md">
                    <Link href={`/jobs/${job.id}`}>
                      <Eye className="mr-2 h-4 w-4" />
                      查看
                    </Link>
                  </Button>
                  {job.outputVideo ? (
                    <Button asChild variant="outline" size="sm" className="h-9 rounded-md">
                      <a href={job.outputVideo.url} download>
                        <Download className="mr-2 h-4 w-4" />
                        下载
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-md text-red-700 hover:bg-red-50"
                    disabled={deletingId === job.id}
                    onClick={() => deleteJob(job.id)}
                  >
                    {deletingId === job.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    删除
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[220px_1fr_180px] lg:items-center">
                <video src={job.sourceVideo.url} className="aspect-video w-full rounded-lg border bg-slate-950 object-cover" muted />
                <div className="space-y-2">
                  <p className="line-clamp-2 text-sm leading-6 text-slate-700">{job.replacementPrompt}</p>
                  <Progress value={job.progress} />
                </div>
                <div className="grid grid-cols-5 gap-2 lg:grid-cols-3">
                  {job.productImages.slice(0, 5).map((asset, index) => (
                    <img
                      key={asset.id}
                      src={asset.url}
                      alt={`商品图 ${index + 1}`}
                      className="aspect-square rounded-md border bg-slate-100 object-cover"
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
