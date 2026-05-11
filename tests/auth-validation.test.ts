import assert from "node:assert/strict";
import test from "node:test";
import { authSubmissionSchema } from "../lib/server/auth-validation.ts";

test("auth submission validation accepts missing turnstile token for verifier handling", () => {
  const result = authSubmissionSchema.safeParse({
    email: "448749018@qq.com",
    password: "password123",
    turnstileToken: ""
  });

  assert.equal(result.success, true);
});

test("auth submission validation still rejects invalid credentials", () => {
  const result = authSubmissionSchema.safeParse({
    email: "not-an-email",
    password: "short",
    turnstileToken: ""
  });

  assert.equal(result.success, false);
});
