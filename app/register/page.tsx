import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/server/auth";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/create");
  return <AuthForm mode="register" />;
}
