import { getRequestIp, verifyTurnstileToken } from "./turnstile.ts";
import { getTurnstileConfig } from "./turnstile-config.ts";

export const TURNSTILE_AUTH_ERROR_MESSAGE = "人机验证失败，请重试";
export const TURNSTILE_CONFIG_ERROR_MESSAGE = "人机验证配置未完成，请联系站点管理员。";

type AuthTurnstileLogger = {
  warn: (...args: unknown[]) => void;
};

type AuthTurnstileOptions = {
  request: Request;
  token: string | undefined;
  context?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  logger?: AuthTurnstileLogger;
};

type AuthTurnstileSuccess = {
  success: true;
};

type AuthTurnstileFailure = {
  success: false;
  status: 403 | 500;
  error: string;
  errorCodes: string[];
};

export type AuthTurnstileResult = AuthTurnstileSuccess | AuthTurnstileFailure;

export async function verifyAuthTurnstile({
  request,
  token,
  context = "auth",
  env = process.env,
  fetchImpl = fetch,
  logger = console
}: AuthTurnstileOptions): Promise<AuthTurnstileResult> {
  const turnstileConfig = getTurnstileConfig(env);

  if (turnstileConfig.isMisconfigured) {
    logger.warn("Turnstile auth is misconfigured", {
      context,
      hasSiteKey: Boolean(turnstileConfig.siteKey),
      hasSecretKey: turnstileConfig.hasSecretKey
    });
    return {
      success: false,
      status: 500,
      error: TURNSTILE_CONFIG_ERROR_MESSAGE,
      errorCodes: ["turnstile-misconfigured"]
    };
  }

  if (!turnstileConfig.isEnabled) {
    return { success: true };
  }

  const turnstile = await verifyTurnstileToken({
    token,
    secret: env.TURNSTILE_SECRET_KEY,
    remoteIp: getRequestIp(request),
    fetchImpl
  });

  if (!turnstile.success) {
    logger.warn("Turnstile auth verification failed", {
      context,
      errorCodes: turnstile.errorCodes
    });
    return {
      success: false,
      status: 403,
      error: TURNSTILE_AUTH_ERROR_MESSAGE,
      errorCodes: turnstile.errorCodes
    };
  }

  return { success: true };
}
