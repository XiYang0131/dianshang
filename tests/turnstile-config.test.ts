import assert from "node:assert/strict";
import test from "node:test";
import { getTurnstileConfig, getTurnstileSiteKey } from "../lib/server/turnstile-config.ts";

test("turnstile site key can be resolved from the public env var", () => {
  assert.equal(
    getTurnstileSiteKey({
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "public-site-key"
    }),
    "public-site-key"
  );
});

test("turnstile site key can be resolved from a server env var", () => {
  assert.equal(
    getTurnstileSiteKey({
      TURNSTILE_SITE_KEY: "server-site-key"
    }),
    "server-site-key"
  );
});

test("turnstile site key ignores empty values", () => {
  assert.equal(
    getTurnstileSiteKey({
      TURNSTILE_SITE_KEY: "   ",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: ""
    }),
    undefined
  );
});

test("turnstile config is ready only when site and secret keys are both present", () => {
  assert.deepEqual(
    getTurnstileConfig({
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "public-site-key",
      TURNSTILE_SECRET_KEY: "secret-key"
    }),
    {
      siteKey: "public-site-key",
      hasSecretKey: true,
      isRequired: true,
      isEnabled: true,
      isMisconfigured: false
    }
  );
});

test("turnstile config reports a partial setup as misconfigured", () => {
  assert.deepEqual(
    getTurnstileConfig({
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET_KEY: "secret-key"
    }),
    {
      siteKey: undefined,
      hasSecretKey: true,
      isRequired: true,
      isEnabled: false,
      isMisconfigured: true
    }
  );
});

test("turnstile config is required by default in production", () => {
  assert.deepEqual(
    getTurnstileConfig({
      NODE_ENV: "production"
    }),
    {
      siteKey: undefined,
      hasSecretKey: false,
      isRequired: true,
      isEnabled: false,
      isMisconfigured: true
    }
  );
});

test("turnstile config can stay disabled in local development", () => {
  assert.deepEqual(
    getTurnstileConfig({
      NODE_ENV: "development"
    }),
    {
      siteKey: undefined,
      hasSecretKey: false,
      isRequired: false,
      isEnabled: false,
      isMisconfigured: false
    }
  );
});
