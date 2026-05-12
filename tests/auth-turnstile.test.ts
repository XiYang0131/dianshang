import assert from "node:assert/strict";
import test from "node:test";
import {
  TURNSTILE_AUTH_ERROR_MESSAGE,
  TURNSTILE_CONFIG_ERROR_MESSAGE,
  verifyAuthTurnstile
} from "../lib/server/auth-turnstile.ts";
import { TURNSTILE_SITEVERIFY_URL } from "../lib/server/turnstile.ts";

test("auth turnstile guard rejects a failed Cloudflare verification with 403", async () => {
  let requestedUrl = "";
  let requestedBody: Record<string, unknown> | null = null;
  const warnings: unknown[] = [];

  const result = await verifyAuthTurnstile({
    request: new Request("https://example.com/api/auth/register", {
      headers: {
        "x-forwarded-for": "203.0.113.7"
      }
    }),
    token: "client-token",
    context: "register",
    env: {
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site-key",
      TURNSTILE_SECRET_KEY: "secret-key",
      NODE_ENV: "production"
    },
    fetchImpl: async (url, init) => {
      requestedUrl = String(url);
      requestedBody = JSON.parse(String(init?.body));
      return Response.json({
        success: false,
        "error-codes": ["timeout-or-duplicate"]
      });
    },
    logger: {
      warn: (...args: unknown[]) => warnings.push(args)
    }
  });

  assert.deepEqual(result, {
    success: false,
    status: 403,
    error: TURNSTILE_AUTH_ERROR_MESSAGE,
    errorCodes: ["timeout-or-duplicate"]
  });
  assert.equal(requestedUrl, TURNSTILE_SITEVERIFY_URL);
  assert.deepEqual(requestedBody, {
    secret: "secret-key",
    response: "client-token",
    remoteip: "203.0.113.7"
  });
  assert.equal(warnings.length, 1);
});

test("auth turnstile guard rejects production misconfiguration before registration work", async () => {
  let called = false;

  const result = await verifyAuthTurnstile({
    request: new Request("https://example.com/api/auth/register"),
    token: "client-token",
    env: {
      NODE_ENV: "production"
    },
    fetchImpl: async () => {
      called = true;
      return Response.json({ success: true });
    },
    logger: {
      warn: () => undefined
    }
  });

  assert.deepEqual(result, {
    success: false,
    status: 500,
    error: TURNSTILE_CONFIG_ERROR_MESSAGE,
    errorCodes: ["turnstile-misconfigured"]
  });
  assert.equal(called, false);
});

test("auth turnstile guard can stay disabled in local development", async () => {
  let called = false;

  const result = await verifyAuthTurnstile({
    request: new Request("http://localhost:3000/api/auth/register"),
    token: "",
    env: {
      NODE_ENV: "development"
    },
    fetchImpl: async () => {
      called = true;
      return Response.json({ success: false });
    }
  });

  assert.deepEqual(result, {
    success: true
  });
  assert.equal(called, false);
});
