# Login Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password registration and login backed by Neon Postgres, with user-scoped uploads, jobs, history, and task actions.

**Architecture:** Keep crypto primitives in a small testable module, keep Prisma/cookie session work in a server-only auth module, and enforce ownership in API/service functions. Existing client pages become client components wrapped by server pages that redirect unauthenticated users.

**Tech Stack:** Next.js App Router, React 19, Prisma, PostgreSQL/Neon, Node `crypto.scrypt`, httpOnly cookies, Node built-in test runner.

---

## File Structure

- Create `lib/server/auth-crypto.ts`: pure password hashing, password verification, and session token hashing. No Next imports so it can be tested with Node.
- Create `lib/server/auth.ts`: server-only Prisma-backed auth/session helpers and cookie helpers.
- Create `tests/auth-crypto.test.ts`: Node tests for password hashing and token hashing.
- Modify `package.json`: add a `test` script using Node's built-in runner.
- Modify `lib/types.ts`: add `userId?: string` to `Asset`.
- Modify `prisma/schema.prisma`: add `User.passwordHash` and `Session`.
- Create `prisma/migrations/20260511000000_add_login_sessions/migration.sql`: SQL for auth fields and session table.
- Modify `lib/server/local-store.ts`: persist `Asset.userId`, filter job/asset access by owner, and support owner-aware delete/list/get.
- Modify `lib/server/job-service.ts`: accept `userId` in create/list/get/delete/retry/sync paths and validate asset/job ownership.
- Modify API routes under `app/api/auth/*`: register, login, logout, current user.
- Modify existing API routes under `app/api/upload` and `app/api/jobs*`: require login and pass `userId`.
- Create `components/auth/auth-form.tsx`: reusable login/register client form.
- Create `app/login/page.tsx` and `app/register/page.tsx`: server wrappers for auth forms.
- Split client route bodies:
  - Move current `app/create/page.tsx` client code to `app/create/create-client.tsx`.
  - Move current `app/history/page.tsx` client code to `app/history/history-client.tsx`.
  - Move current `app/jobs/[id]/page.tsx` client code to `app/jobs/[id]/job-detail-client.tsx`.
- Replace the three route `page.tsx` files with server wrappers that require auth.
- Modify `components/site-header.tsx` and `app/layout.tsx`: show auth-aware navigation and logout.
- Modify `.env.example` and `README.md`: document `DATABASE_URL` and auth behavior without real secrets.
- Modify `.env.local`: set the real `DATABASE_URL` provided by the user. This file is gitignored.

---

### Task 1: Add Test Runner and Crypto Tests

**Files:**
- Modify: `package.json`
- Create: `tests/auth-crypto.test.ts`
- Create: `lib/server/auth-crypto.ts`

- [ ] **Step 1: Add a failing test script**

In `package.json`, add:

```json
"test": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/*.test.ts"
```

- [ ] **Step 2: Write the failing crypto tests**

Create `tests/auth-crypto.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createPasswordHash,
  hashSessionToken,
  verifyPassword
} from "../lib/server/auth-crypto.ts";

test("password hashes verify the original password only", async () => {
  const hash = await createPasswordHash("correct horse battery staple");

  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("password hashes use a unique salt", async () => {
  const first = await createPasswordHash("same password");
  const second = await createPasswordHash("same password");

  assert.notEqual(first, second);
});

test("session token hash is deterministic and does not expose the raw token", () => {
  const token = "raw-session-token";
  const hash = hashSessionToken(token);

  assert.equal(hashSessionToken(token), hash);
  assert.notEqual(hash, token);
  assert.equal(hash.length > 30, true);
});
```

- [ ] **Step 3: Run tests and confirm RED**

Run:

```bash
npm test
```

Expected: FAIL because `lib/server/auth-crypto.ts` does not exist.

- [ ] **Step 4: Implement crypto helpers**

Create `lib/server/auth-crypto.ts`:

```ts
import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const HASH_PREFIX = "scrypt";

function toBase64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

export async function createPasswordHash(password: string) {
  const salt = toBase64Url(randomBytes(16));
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${HASH_PREFIX}$${salt}$${toBase64Url(derived)}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [prefix, salt, hash] = storedHash.split("$");
  if (prefix !== HASH_PREFIX || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64url");
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}
```

- [ ] **Step 5: Run tests and confirm GREEN**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json tests/auth-crypto.test.ts lib/server/auth-crypto.ts
git commit -m "Add auth crypto helpers"
```

---

### Task 2: Add Auth Schema and Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260511000000_add_login_sessions/migration.sql`
- Modify: `lib/types.ts`
- Modify: `.env.local`

- [ ] **Step 1: Update Prisma schema**

In `prisma/schema.prisma`, update `User` and add `Session`:

```prisma
model User {
  id           String    @id @default(cuid())
  email        String?   @unique
  passwordHash String?
  name         String?
  sessions     Session[]
  jobs         Job[]
  assets       Asset[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([expiresAt])
}
```

- [ ] **Step 2: Create SQL migration**

Create `prisma/migrations/20260511000000_add_login_sessions/migration.sql`:

```sql
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Add asset owner type**

In `lib/types.ts`, add `userId?: string` to `Asset`:

```ts
export type Asset = {
  id: string;
  userId?: string;
  kind: AssetKind;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
};
```

- [ ] **Step 4: Put the real Neon URL in `.env.local`**

Set:

```bash
DATABASE_URL="<the Neon Postgres URL provided by the user>"
```

Do not add `.env.local` to git.

- [ ] **Step 5: Generate Prisma client**

Run:

```bash
npm run prisma:generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260511000000_add_login_sessions/migration.sql lib/types.ts
git commit -m "Add auth database schema"
```

---

### Task 3: Implement Server Auth

**Files:**
- Create: `lib/server/auth.ts`
- Create: `app/api/auth/register/route.ts`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/api/auth/me/route.ts`

- [ ] **Step 1: Write the auth module**

Create `lib/server/auth.ts`:

```ts
import "server-only";

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { createPasswordHash, hashSessionToken, verifyPassword } from "@/lib/server/auth-crypto";
import { prisma } from "@/lib/server/prisma";

export const AUTH_COOKIE_NAME = "product-replacer-session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export const credentialsSchema = z.object({
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});

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
```

- [ ] **Step 2: Add register route**

Create `app/api/auth/register/route.ts`:

```ts
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createSession, createUserWithPassword, credentialsSchema, setSessionCookie } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = credentialsSchema.parse(await request.json());
    const user = await createUserWithPassword(input.email, input.password);
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "请输入有效邮箱和至少 8 位密码。" }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "这个邮箱已经注册。" }, { status: 409 });
    }
    return NextResponse.json({ error: "注册失败。" }, { status: 400 });
  }
}
```

- [ ] **Step 3: Add login route**

Create `app/api/auth/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createSession, credentialsSchema, setSessionCookie, verifyCredentials } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = credentialsSchema.parse(await request.json());
    const user = await verifyCredentials(input.email, input.password);
    if (!user) {
      return NextResponse.json({ error: "邮箱或密码错误。" }, { status: 401 });
    }
    const session = await createSession(user.id);
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "请输入有效邮箱和密码。" }, { status: 400 });
    }
    return NextResponse.json({ error: "登录失败。" }, { status: 400 });
  }
}
```

- [ ] **Step 4: Add logout and me routes**

Create `app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { deleteCurrentSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await deleteCurrentSession();
  return NextResponse.json({ ok: true });
}
```

Create `app/api/auth/me/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}
```

- [ ] **Step 5: Verify**

Run:

```bash
npm run typecheck
npm test
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add lib/server/auth.ts app/api/auth/register/route.ts app/api/auth/login/route.ts app/api/auth/logout/route.ts app/api/auth/me/route.ts
git commit -m "Add Prisma-backed auth routes"
```

---

### Task 4: Scope Storage and Job Services by User

**Files:**
- Modify: `lib/server/local-store.ts`
- Modify: `lib/server/job-service.ts`
- Modify: `app/api/upload/route.ts`
- Modify: `app/api/jobs/route.ts`
- Modify: `app/api/jobs/[id]/route.ts`
- Modify: `app/api/jobs/[id]/retry/route.ts`
- Modify: `app/api/jobs/[id]/sync/route.ts`
- Modify: `app/api/debug/jobs/[id]/route.ts`

- [ ] **Step 1: Persist asset owner**

In `lib/server/local-store.ts`, update `assetFromDatabase`:

```ts
function assetFromDatabase(asset: DatabaseAsset): Asset {
  return {
    id: asset.id,
    userId: asset.userId ?? undefined,
    kind: asset.kind,
    url: asset.url,
    filename: asset.filename,
    mimeType: asset.mimeType,
    size: asset.size,
    durationSeconds: asset.durationSeconds ?? undefined,
    metadata: isRecord(asset.metadata) ? asset.metadata : undefined,
    createdAt: asset.createdAt.toISOString()
  };
}
```

Update `saveAssetToDatabase` create/update data to include:

```ts
userId: asset.userId ?? null,
```

and add `userId: createData.userId` to the `update` block.

- [ ] **Step 2: Add owner-aware raw store functions**

Change signatures and database filters:

```ts
export async function getJobRaw(id: string, userId?: string) {
  if (shouldUseDatabase()) {
    return getJobFromDatabase(id, userId);
  }
  const job = await getJobRawWithoutOwner(id);
  return !userId || job?.userId === userId ? job : null;
}

export async function listJobsRaw(userId?: string) {
  if (shouldUseDatabase()) {
    return listJobsFromDatabase(userId);
  }
  const jobs = await listJobsRawWithoutOwner();
  return userId ? jobs.filter((job) => job.userId === userId) : jobs;
}

export async function deleteJobRaw(id: string, userId?: string) {
  if (shouldUseDatabase()) {
    const deleted = await prisma.job.deleteMany({
      where: {
        id,
        ...(userId ? { userId } : {})
      }
    });
    return deleted.count > 0;
  }
  const existing = await getJobRaw(id, userId);
  if (!existing) return false;
  // keep the existing blob/local deletion body after this guard
}
```

If helper extraction is needed, create private `getJobRawWithoutOwner` and `listJobsRawWithoutOwner` by moving the existing non-database logic into those helpers.

- [ ] **Step 3: Add userId to job service**

In `lib/server/job-service.ts`, remove `DEFAULT_USER_ID` and update exported functions:

```ts
export async function createJob(input: z.infer<typeof createJobSchema>, userId: string) {
  // existing validation
  if (sourceVideo.userId !== userId) {
    throw new Error("源视频不存在，请重新上传");
  }
  if (productImages.some((asset) => asset.userId !== userId)) {
    throw new Error("部分商品图不存在，请重新上传");
  }
  const job: ReplacementJob = {
    id: randomUUID(),
    userId,
    // existing fields
  };
}

export async function getJob(id: string, userId: string) {
  const job = await getJobRaw(id, userId);
  if (!job) return null;
  return advanceJob(job);
}

export async function listJobs(userId: string) {
  const jobs = await listJobsRaw(userId);
  const advanced = await Promise.all(jobs.map((job) => advanceJob(job)));
  return advanced.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function retryJob(id: string, userId: string) {
  const current = await getJobRaw(id, userId);
  // keep existing retry body
}

export async function deleteJob(id: string, userId: string) {
  return deleteJobRaw(id, userId);
}
```

- [ ] **Step 4: Require auth in upload**

In `app/api/upload/route.ts`, import `getCurrentUser`, then at the start of `POST`:

```ts
const user = await getCurrentUser();
if (!user) {
  return NextResponse.json({ error: "请先登录。" }, { status: 401 });
}
```

Add `userId: user.id` to the created `asset`.

- [ ] **Step 5: Require auth in job APIs**

In each jobs route, get the user first:

```ts
const user = await getCurrentUser();
if (!user) {
  return NextResponse.json({ error: "请先登录。" }, { status: 401 });
}
```

Then call owner-aware services:

```ts
const jobs = await listJobs(user.id);
const job = await createJob(input, user.id);
const job = await getJobWithRetries(id, user.id);
const deleted = await deleteJob(id, user.id);
const job = await retryJob(id, user.id);
const job = await syncJobSnapshot(snapshot, user.id);
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npm test
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add lib/server/local-store.ts lib/server/job-service.ts app/api/upload/route.ts app/api/jobs app/api/debug/jobs
git commit -m "Scope jobs and uploads to authenticated users"
```

---

### Task 5: Add Login/Register UI and Protected Pages

**Files:**
- Create: `components/auth/auth-form.tsx`
- Create: `app/login/page.tsx`
- Create: `app/register/page.tsx`
- Create: `app/create/create-client.tsx`
- Modify: `app/create/page.tsx`
- Create: `app/history/history-client.tsx`
- Modify: `app/history/page.tsx`
- Create: `app/jobs/[id]/job-detail-client.tsx`
- Modify: `app/jobs/[id]/page.tsx`
- Modify: `components/site-header.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create shared auth form**

Create `components/auth/auth-form.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (isRegister && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || (isRegister ? "注册失败。" : "登录失败。"));
      router.push("/create");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "请求失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container flex min-h-[calc(100vh-4rem)] items-center justify-center py-10">
      <Card className="w-full max-w-md rounded-lg shadow-none">
        <CardHeader>
          <CardTitle className="text-2xl">{isRegister ? "创建账号" : "登录账号"}</CardTitle>
          <CardDescription>
            {isRegister ? "注册后即可创建和管理自己的换品任务。" : "登录后继续管理你的换品任务。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            {isRegister ? (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">确认密码</Label>
                <Input id="confirm-password" type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
              </div>
            ) : null}
            <Button type="submit" className="h-11 w-full rounded-md" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : isRegister ? <UserPlus className="mr-2 h-4 w-4" /> : <LogIn className="mr-2 h-4 w-4" />}
              {isRegister ? "注册并登录" : "登录"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-500">
            {isRegister ? "已有账号？" : "还没有账号？"}
            <Link className="ml-1 font-medium text-primary" href={isRegister ? "/login" : "/register"}>
              {isRegister ? "去登录" : "去注册"}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add login/register server pages**

Create `app/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/server/auth";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/create");
  return <AuthForm mode="login" />;
}
```

Create `app/register/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/server/auth";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/create");
  return <AuthForm mode="register" />;
}
```

- [ ] **Step 3: Split protected client pages**

Move the current full contents of:

```text
app/create/page.tsx -> app/create/create-client.tsx
app/history/page.tsx -> app/history/history-client.tsx
app/jobs/[id]/page.tsx -> app/jobs/[id]/job-detail-client.tsx
```

Rename each default export to `CreateClient`, `HistoryClient`, and `JobDetailClient`.

- [ ] **Step 4: Add server page guards**

Replace `app/create/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { CreateClient } from "./create-client";

export default async function CreatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <CreateClient />;
}
```

Replace `app/history/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { HistoryClient } from "./history-client";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <HistoryClient />;
}
```

Replace `app/jobs/[id]/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { JobDetailClient } from "./job-detail-client";

export default async function JobDetailPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <JobDetailClient />;
}
```

- [ ] **Step 5: Make header auth-aware**

In `app/layout.tsx`, fetch the current user and pass it:

```tsx
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <html lang="zh-CN">
      <body>
        <SiteHeader user={user} />
        <main>{children}</main>
      </body>
    </html>
  );
}
```

In `components/site-header.tsx`, add a `user` prop and logout button:

```tsx
type SiteHeaderProps = {
  user: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
};
```

Use `fetch("/api/auth/logout", { method: "POST" })`, then `router.push("/login")` and `router.refresh()`.

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck
npm test
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add components/auth app/login app/register app/create app/history app/jobs components/site-header.tsx app/layout.tsx
git commit -m "Add login UI and protected pages"
```

---

### Task 6: Apply Database Migration and Verify End-to-End

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Document auth env**

In `.env.example`, keep only a placeholder:

```bash
DATABASE_URL="postgresql://user:password@host.neon.tech/video_replacer?sslmode=require"
```

Do not include the real Neon password.

- [ ] **Step 2: Document login flow**

In `README.md`, add:

```md
## 登录与用户数据

应用使用邮箱密码登录。注册和登录数据保存在 `DATABASE_URL` 指向的 Postgres 数据库中，登录态通过 httpOnly cookie 保存。上传素材、创建任务、历史记录和任务操作都会绑定到当前登录用户。

首次连接新的 Neon 数据库后执行：

```bash
npm run prisma:migrate:deploy
```
```

- [ ] **Step 3: Deploy migration to Neon**

Run:

```bash
npm run prisma:migrate:deploy
```

Expected: migration applies successfully or reports no pending migrations.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 5: Manual browser check**

Run:

```bash
npm run dev
```

Open `http://localhost:3000` and verify:

- Register a new email.
- Confirm navigation shows the email and logout.
- Create one job.
- Confirm `/history` shows that job.
- Logout.
- Confirm `/create` redirects to `/login`.

- [ ] **Step 6: Commit**

```bash
git add .env.example README.md
git commit -m "Document login setup"
```

---

## Self-Review Notes

- Spec coverage: registration, login, httpOnly sessions, Neon via `DATABASE_URL`, user-scoped assets/jobs, protected pages, logout, docs, and verification are all mapped to tasks.
- Placeholder scan: no unresolved placeholder or unspecified "add tests" steps remain.
- Type consistency: `AuthUser`, `Asset.userId`, service function `userId` parameters, and route calls use the same names throughout.
