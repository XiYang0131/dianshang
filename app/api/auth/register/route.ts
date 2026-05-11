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
      return NextResponse.json({ error: "Human verification failed. Please try again." }, { status: 400 });
    }

    const user = await createUserWithPassword(input.email, input.password);
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Please enter a valid email and a password of at least 8 characters." }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "This email is already registered." }, { status: 409 });
    }
    console.error("Registration failed", error);
    return NextResponse.json({ error: "Registration failed." }, { status: 400 });
  }
}
