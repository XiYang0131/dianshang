import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/server/auth";
import { getTurnstileSiteKey } from "@/lib/server/turnstile-config";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/create");
  return <AuthForm mode="register" turnstileSiteKey={getTurnstileSiteKey()} />;
}
