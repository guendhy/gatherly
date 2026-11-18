#!/usr/bin/env node
/**
 * After `next build`: fails if any server secret (by name or, when set in the
 * environment, by value) appears in the browser bundle (.next/static).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STATIC_DIR = join(process.cwd(), ".next", "static");
if (!existsSync(STATIC_DIR)) {
  console.error("✗ .next/static not found — run `npm run build` first.");
  process.exit(1);
}

const SECRET_NAMES = ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "SESSION_SECRET", "TOKEN_ENCRYPTION_KEY"];
const needles = [...SECRET_NAMES];
for (const name of SECRET_NAMES) {
  const value = process.env[name]?.trim();
  if (value && value.length >= 12) needles.push(value);
}
// Server-only modules that must never be bundled for the browser.
needles.push("gatherly_rate_limit", "refresh_token_enc", "oauth2.googleapis.com/token");

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(STATIC_DIR).filter((f) => /\.(js|css|html|json|map)$/.test(f));
const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const needle of needles) if (text.includes(needle)) hits.push({ file, needle: SECRET_NAMES.includes(needle) || needle.length < 30 ? needle : `${needle.slice(0, 4)}…(value)` });
}

if (hits.length) {
  console.error("✗ Sensitive strings found in the browser bundle:");
  for (const h of hits) console.error(`  ${h.needle}  in  ${h.file}`);
  process.exit(1);
}
console.log(`✓ Scanned ${files.length} browser bundle files — no server secrets found.`);
