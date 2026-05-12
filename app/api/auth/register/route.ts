import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authSubmissionSchema, createSession, createUserWithPassword, setSessionCookie } from "@/lib/server/auth";
import { verifyAuthTurnstile } from "@/lib/server/auth-turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = authSubmissionSchema.parse(await request.json());
    const turnstile = await verifyAuthTurnstile({
      request,
      token: input.turnstileToken,
      context: "register"
    });
    if (!turnstile.success) {
      return NextResponse.json({ error: turnstile.error }, { status: turnstile.status });
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
