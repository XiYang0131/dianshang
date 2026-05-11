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
