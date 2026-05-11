import assert from "node:assert/strict";
import test from "node:test";
import { TURNSTILE_SITEVERIFY_URL, verifyTurnstileToken } from "../lib/server/turnstile.ts";

test("turnstile verification rejects a missing token without calling fetch", async () => {
  let called = false;

  const result = await verifyTurnstileToken({
    token: "",
    secret: "secret",
    fetchImpl: async () => {
      called = true;
      throw new Error("fetch should not be called");
    }
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.errorCodes, ["missing-input-response"]);
  assert.equal(called, false);
});

test("turnstile verification posts token, secret, and remote IP to Cloudflare", async () => {
  let requestedUrl = "";
  let requestedBody: Record<string, unknown> | null = null;

  const result = await verifyTurnstileToken({
    token: "client-token",
    secret: "server-secret",
    remoteIp: "203.0.113.10",
    fetchImpl: async (url, init) => {
      requestedUrl = String(url);
      requestedBody = JSON.parse(String(init?.body));
      return Response.json({ success: true });
    }
  });

  assert.equal(result.success, true);
  assert.equal(requestedUrl, TURNSTILE_SITEVERIFY_URL);
  assert.deepEqual(requestedBody, {
    secret: "server-secret",
    response: "client-token",
    remoteip: "203.0.113.10"
  });
});

test("turnstile verification reports Cloudflare error codes", async () => {
  const result = await verifyTurnstileToken({
    token: "expired-token",
    secret: "server-secret",
    fetchImpl: async () =>
      Response.json({
        success: false,
        "error-codes": ["timeout-or-duplicate"]
      })
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.errorCodes, ["timeout-or-duplicate"]);
});
