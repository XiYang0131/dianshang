import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusCopy: Record<JobStatus, string> = {
  pending: "排队中",
  processing: "生成中",
  success: "已完成",
  failed: "失败"
};

const statusClassName: Record<JobStatus, string> = {
  pending: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  processing: "bg-cyan-100 text-cyan-800 hover:bg-cyan-100",
  success: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  failed: "bg-red-100 text-red-800 hover:bg-red-100"
};

export function JobStatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  return (
    <Badge className={cn("border-transparent", statusClassName[status], className)}>
      {statusCopy[status]}
    </Badge>
  );
}
