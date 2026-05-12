import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/server/auth";
import { getTurnstileConfig } from "@/lib/server/turnstile-config";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/create");
  const turnstileConfig = getTurnstileConfig();
  return (
    <AuthForm
      mode="register"
      turnstileSiteKey={turnstileConfig.siteKey}
      turnstileRequired={turnstileConfig.isRequired}
      turnstileMisconfigured={turnstileConfig.isMisconfigured}
    />
  );
}
