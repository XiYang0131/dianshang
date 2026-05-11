export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

type TurnstileFetch = typeof fetch;

type VerifyTurnstileTokenOptions = {
  token: string | undefined;
  secret?: string;
  remoteIp?: string;
  fetchImpl?: TurnstileFetch;
};

export type TurnstileVerificationResult = {
  success: boolean;
  errorCodes: string[];
};

export async function verifyTurnstileToken({
  token,
  secret = process.env.TURNSTILE_SECRET_KEY,
  remoteIp,
  fetchImpl = fetch
}: VerifyTurnstileTokenOptions): Promise<TurnstileVerificationResult> {
  if (!token) {
    return {
      success: false,
      errorCodes: ["missing-input-response"]
    };
  }

  if (!secret) {
    return {
      success: false,
      errorCodes: ["missing-input-secret"]
    };
  }

  const body: Record<string, string> = {
    secret,
    response: token
  };
  if (remoteIp) {
    body.remoteip = remoteIp;
  }

  try {
    const response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      return {
        success: false,
        errorCodes: ["siteverify-request-failed"]
      };
    }

    const payload = (await response.json()) as TurnstileResponse;
    return {
      success: payload.success === true,
      errorCodes: payload["error-codes"] ?? []
    };
  } catch {
    return {
      success: false,
      errorCodes: ["siteverify-request-failed"]
    };
  }
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return (
    request.headers.get("cf-connecting-ip") ??
    (forwardedFor ? forwardedFor.split(",")[0]?.trim() : undefined)
  );
}
