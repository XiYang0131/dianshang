import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authSubmissionSchema, createSession, createUserWithPassword, setSessionCookie } from "@/lib/server/auth";
import { getRequestIp, verifyTurnstileToken } from "@/lib/server/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = authSubmissionSchema.parse(await request.json());
    const turnstile = await verifyTurnstileToken({
      token: input.turnstileToken,
      remoteIp: getRequestIp(request)
    });
    if (!turnstile.success) {
      return NextResponse.json({ error: "请先完成人机验证后再试。" }, { status: 400 });
    }

    const user = await createUserWithPassword(input.email, input.password);
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "请输入有效邮箱，密码至少 8 位。" }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "这个邮箱已经注册过了。" }, { status: 409 });
    }
    console.error("Registration failed", error);
    return NextResponse.json({ error: "注册失败，请稍后再试。" }, { status: 400 });
  }
}
