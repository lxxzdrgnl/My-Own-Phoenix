# Plan 3: Security Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix known security vulnerabilities before SaaS deployment — localhost auth bypass, hardcoded crypto salt, missing rate limiting.

**Architecture:** Patch existing files. Add rate-limit middleware. Migrate encrypted data to new format.

**Tech Stack:** Node.js crypto, Next.js middleware

**Depends on:** Plan 1 (PostgreSQL migration completed, data accessible)

**Spec:** `docs/superpowers/specs/2026-05-14-saas-multi-tenant-design.md` section 9

---

### Task 1: Fix localhost Auth Bypass

**Files:**
- Modify: `lib/auth-server.ts`

**Current (vulnerable, lines 22-26):**
```typescript
if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
  const ua = req.headers.get("user-agent") ?? "";
  if (ua.startsWith("python-httpx")) return "internal-service";
}
```

**Replace with:**
```typescript
import { timingSafeEqual } from "crypto";

// In verifyAuth():
const internalToken = req.headers.get("X-Internal-Token");
const expected = process.env.INTERNAL_SERVICE_TOKEN;
if (internalToken && expected && internalToken.length === expected.length) {
  try {
    if (timingSafeEqual(Buffer.from(internalToken), Buffer.from(expected))) {
      return "internal-service";
    }
  } catch {
    // Length mismatch or encoding error — fall through
  }
}
```

- Remove the `host.startsWith("localhost")` block entirely
- Add `INTERNAL_SERVICE_TOKEN` to `.env.example` with generation instruction:
  `INTERNAL_SERVICE_TOKEN=` + `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Update eval-worker Dockerfile/config to send this header:
  `headers: { "X-Internal-Token": process.env.INTERNAL_SERVICE_TOKEN }`

---

### Task 2: Fix Hardcoded Crypto Salt

**Files:**
- Modify: `lib/crypto.ts`

**Current (weak, line 9):**
```typescript
return scryptSync(secret, "salt", 32);
```

**New encrypt function — random salt per encryption:**
```typescript
export function encrypt(plaintext: string): string {
  const key = getKey();
  const salt = randomBytes(16);
  const derivedKey = scryptSync(key, salt, 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // New 4-part format: salt:iv:authTag:encrypted
  return [salt, iv, authTag, encrypted].map(b => b.toString("base64")).join(":");
}
```

**New decrypt function — handle both old (3-part) and new (4-part) formats:**
```typescript
export function decrypt(encoded: string): string {
  const parts = encoded.split(":");
  const key = getKey();

  if (parts.length === 3) {
    // Legacy format: iv:authTag:encrypted (hardcoded salt)
    const derivedKey = scryptSync(key, "salt", 32);
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(dataB64, "base64");
    const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  // New format: salt:iv:authTag:encrypted
  const [saltB64, ivB64, tagB64, dataB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const derivedKey = scryptSync(key, salt, 32);
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
```

**getKey() change — use raw secret, not scrypt on it (scrypt happens per-encrypt now):**
```typescript
function getKey(): string {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error("ENCRYPTION_SECRET env var is required");
  return secret;
}
```

---

### Task 3: Migrate Existing Encrypted Data

**Files:**
- Create: `scripts/migrate-encryption.ts`

**One-time script to re-encrypt all LlmProvider API keys:**
```typescript
// Read all LlmProvider records
// For each: decrypt with old format → re-encrypt with new format → update DB
// Run: npx tsx scripts/migrate-encryption.ts
```

**Safety:** Script checks format first (3-part = old, 4-part = already migrated). Idempotent.

---

### Task 4: Add Rate Limiting

**Files:**
- Create: `lib/rate-limit.ts`
- Modify: Key API routes

**Simple in-memory rate limiter (sufficient for single-server deployment):**
```typescript
// lib/rate-limit.ts
// Map<key, { count: number, resetAt: number }>
// rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean, remaining: number }
```

**Apply to:**
- `/api/projects/join` — 5 req/min per IP (brute-force protection)
- `/api/collect` — 1000 req/min per trace key (abuse protection)
- `/api/ws-relay` — 5 connections/min per connector key

---

### Task 5: Restrict Phoenix Network Access

**Files:**
- Modify: `docker-compose.yml`

**Change Phoenix service:**
```yaml
phoenix:
  # Remove ports exposure — Phoenix only accessible from internal Docker network
  # ports:
  #   - "6006:6006"
  #   - "4317:4317"
  #   - "4318:4318"
  networks:
    - internal

# Add network definition:
networks:
  internal:
    driver: bridge
```

**Dashboard service accesses Phoenix via Docker DNS (`phoenix:6006`) instead of `localhost:6006`.**

Update `PHOENIX_URL` environment variable in dashboard service:
```yaml
environment:
  - PHOENIX_URL=http://phoenix:6006
```
