import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authSubmissionSchema, createSession, setSessionCookie, verifyCredentials } from "@/lib/server/auth";
import { getRequestIp, verifyTurnstileToken } from "@/lib/server/turnstile";
import { getTurnstileConfig } from "@/lib/server/turnstile-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = authSubmissionSchema.parse(await request.json());
    const turnstileConfig = getTurnstileConfig();

    if (turnstileConfig.isMisconfigured) {
      return NextResponse.json({ error: "人机验证配置未完成，请联系站点管理员。" }, { status: 500 });
    }

    if (turnstileConfig.isEnabled) {
      const turnstile = await verifyTurnstileToken({
        token: input.turnstileToken,
        remoteIp: getRequestIp(request)
      });
      if (!turnstile.success) {
        return NextResponse.json({ error: "请先完成人机验证后再试。" }, { status: 400 });
      }
    }

    const user = await verifyCredentials(input.email, input.password);
    if (!user) {
      return NextResponse.json({ error: "邮箱或密码不正确。" }, { status: 401 });
    }
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "请输入有效邮箱和密码。" }, { status: 400 });
    }
    console.error("Login failed", error);
    return NextResponse.json({ error: "登录失败，请稍后再试。" }, { status: 400 });
  }
}
