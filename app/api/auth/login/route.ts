import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authSubmissionSchema, createSession, setSessionCookie, verifyCredentials } from "@/lib/server/auth";
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
      return NextResponse.json({ error: "Human verification failed. Please try again." }, { status: 400 });
    }

    const user = await verifyCredentials(input.email, input.password);
    if (!user) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Please enter a valid email and password." }, { status: 400 });
    }
    console.error("Login failed", error);
    return NextResponse.json({ error: "Login failed." }, { status: 400 });
  }
}
