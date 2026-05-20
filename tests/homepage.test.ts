import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("home page renders the animated shader hero", () => {
  const source = readFileSync("app/page.tsx", "utf8");

  assert.match(source, /animated-shader-hero/);
  assert.match(source, /<AnimatedShaderHero\b/);
});
