import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { CreateClient } from "./create-client";

export default async function CreatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <CreateClient />;
}
