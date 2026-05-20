import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("home page does not render the animated shader hero as page content", () => {
  const pageSource = readFileSync("app/page.tsx", "utf8");

  assert.doesNotMatch(pageSource, /animated-shader-hero/);
  assert.doesNotMatch(pageSource, /<AnimatedShaderHero\b/);
});

test("root layout renders the site intro before the app shell", () => {
  const layoutSource = readFileSync("app/layout.tsx", "utf8");

  assert.match(layoutSource, /@\/components\/site-intro/);
  assert.match(layoutSource, /<SiteIntro\s*\/>/);
});
