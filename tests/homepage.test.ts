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

test("home page uses the scroll expansion hero as page content", () => {
  const pageSource = readFileSync("app/page.tsx", "utf8");
  const componentSource = readFileSync("components/ui/scroll-expansion-hero.tsx", "utf8");
  const packageSource = readFileSync("package.json", "utf8");
  const nextConfigSource = readFileSync("next.config.mjs", "utf8");

  assert.match(pageSource, /@\/components\/ui\/scroll-expansion-hero/);
  assert.match(pageSource, /<ScrollExpandMedia\b/);
  assert.match(componentSource, /from "framer-motion"/);
  assert.match(packageSource, /"framer-motion"/);
  assert.match(nextConfigSource, /images\.unsplash\.com/);
});
