import assert from "node:assert/strict";
import test from "node:test";
import { getTurnstileSiteKey } from "../lib/server/turnstile-config.ts";

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
