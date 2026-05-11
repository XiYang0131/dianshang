import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { JobDetailClient } from "./job-detail-client";

export default async function JobDetailPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <JobDetailClient />;
}
