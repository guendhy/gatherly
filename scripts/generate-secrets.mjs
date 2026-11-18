#!/usr/bin/env node
// Prints fresh values for SESSION_SECRET and TOKEN_ENCRYPTION_KEY. Paste them into Vercel / .env.local.
import { randomBytes } from "node:crypto";

console.log(`SESSION_SECRET=${randomBytes(48).toString("base64url")}`);
console.log(`TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
