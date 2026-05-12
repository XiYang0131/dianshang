function cleanEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getTurnstileSiteKey(env: Record<string, string | undefined> = process.env) {
  return cleanEnvValue(env.TURNSTILE_SITE_KEY) ?? cleanEnvValue(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export function getTurnstileConfig(env: Record<string, string | undefined> = process.env) {
  const siteKey = getTurnstileSiteKey(env);
  const hasSecretKey = Boolean(cleanEnvValue(env.TURNSTILE_SECRET_KEY));
  const hasAnyTurnstileSetting = Boolean(siteKey || hasSecretKey);
  const isProduction = env.NODE_ENV === "production" || Boolean(env.VERCEL);
  const isRequired = isProduction || hasAnyTurnstileSetting;
  const isEnabled = Boolean(siteKey && hasSecretKey);

  return {
    siteKey,
    hasSecretKey,
    isRequired,
    isEnabled,
    isMisconfigured: isRequired && !isEnabled
  };
}
