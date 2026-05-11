function cleanEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getTurnstileSiteKey(env: Record<string, string | undefined> = process.env) {
  return cleanEnvValue(env.TURNSTILE_SITE_KEY) ?? cleanEnvValue(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}
