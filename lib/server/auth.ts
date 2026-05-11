import "server-only";

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { createPasswordHash, hashSessionToken, verifyPassword } from "@/lib/server/auth-crypto";
export { authSubmissionSchema, credentialsSchema } from "@/lib/server/auth-validation";
import { prisma } from "@/lib/server/prisma";

export const AUTH_COOKIE_NAME = "product-replacer-session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
};

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name
  };
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export async function createUserWithPassword(email: string, password: string) {
  const passwordHash = await createPasswordHash(password);
  return prisma.user.create({
    data: {
      email,
      passwordHash
    },
    select: {
      id: true,
      email: true,
      name: true
    }
  });
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true
    }
  });

  if (!user?.passwordHash) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? publicUser(user) : null;
}

export async function createSession(userId: string) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt
    }
  });
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    }
  });

  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  return publicUser(session.user);
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashSessionToken(token) }
    });
  }
  await clearSessionCookie();
}
