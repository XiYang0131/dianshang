import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { HistoryClient } from "./history-client";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <HistoryClient />;
}
