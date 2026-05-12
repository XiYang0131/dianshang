import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/server/auth";
import { getTurnstileConfig } from "@/lib/server/turnstile-config";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/create");
  const turnstileConfig = getTurnstileConfig();
  return (
    <AuthForm
      mode="login"
      turnstileSiteKey={turnstileConfig.siteKey}
      turnstileRequired={turnstileConfig.isEnabled}
      turnstileMisconfigured={turnstileConfig.isMisconfigured}
    />
  );
}
