# Plan 5: Trace Collection Proxy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `/api/collect` endpoint that authenticates trace submissions via `pt_*` key and proxies OTel spans to the shared Phoenix server with project-scoped naming.

**Architecture:** Thin proxy in Next.js API route. Validates trace key by SHA-256 hash lookup against Project.traceKeyHash. Prepends project slug to Phoenix project name for isolation. Forwards raw OTel payload to Phoenix's OTLP HTTP endpoint.

**Tech Stack:** Next.js API route, OTel HTTP protocol, SHA-256 hashing

**Depends on:** Plan 1 (Project model with traceKeyHash), Plan 3 (Phoenix internal-only network)

**Spec:** Section 6

---

### Task 1: Create /api/collect Endpoint

**Files:**
- Create: `app/api/collect/route.ts`

**POST /api/collect — OTel trace ingestion proxy:**
```
Flow:
1. Extract API key from Authorization header: "Bearer pt_xxx"
2. SHA-256 hash the key
3. Look up Project by traceKeyHash
4. If not found → 401 Unauthorized
5. Rate limit check: 1000 req/min per project (from lib/rate-limit.ts)
6. Read raw request body (binary OTel protobuf or JSON)
7. Determine Phoenix project name: "{project.slug}_{originalProjectName}"
   - originalProjectName extracted from OTel resource attributes or default to "default"
8. Forward to Phoenix: POST http://phoenix:4318/v1/traces
   - Pass through Content-Type header
   - Add/modify resource attribute "project.name" to prefixed version
9. Return Phoenix's response status
```

**Key detail — project name prefixing:**
- OTel spans contain `resource.attributes["openinference.project.name"]`
- Proxy must prepend `{project.slug}_` to this value
- If attribute missing, use `{project.slug}_default`
- For JSON payloads: parse, modify attribute, re-serialize
- For protobuf payloads: may need to accept JSON only initially (simpler MVP)

**Simplification for MVP:**
- Accept JSON format only (`Content-Type: application/json`)
- Parse body, inject project prefix into resource attributes
- Forward modified JSON to Phoenix

---

### Task 2: Trace Key Regeneration API

**Files:**
- Modify: `app/api/projects/route.ts` (add PATCH)

**PATCH /api/projects — Regenerate trace key:**
```
Body: { projectId, action: "regenerateTraceKey" }
Auth: owner only
Flow:
1. Generate new pt_* key
2. Hash with SHA-256
3. Update Project.traceKeyHash
4. Return new key (shown once, old key immediately invalid)
```

---

### Task 3: Update Settings API Keys Tab

**Files:**
- Modify: `app/[slug]/settings/page.tsx` (API Keys tab)

**API Keys tab content (from spec 11.5):**
- Trace Key section:
  - Masked key display: `pt_clx1a•••••••def`
  - [Show] toggle (reveals full key — only if recently generated)
  - [Copy] button
  - [Regenerate] button (owner only) with confirmation dialog
  - Warning: "Key is shown once at generation. Regenerating invalidates the old key."
- Endpoint display:
  - `https://{hostname}/api/collect` [Copy]
- Quick Start code snippet with [Copy] button

**Note:** Key is stored hashed. Full key is only available right after generation (returned from POST/PATCH response). After that, only masked version is shown. User must save the key when first shown.

---

### Task 4: Update Onboarding Setup Guide

**Files:**
- Modify: `app/page.tsx` (or create a setup guide component)

**After project creation, show setup guide (from spec 11.1):**
- Step 1: display trace key + endpoint + install snippet
- Step 2: connector setup (optional)
- Step 3: invite team (optional)
- "Status: Waiting for first trace..." with auto-polling
- When first trace arrives → ✓ indicator + [Go to Dashboard] button

**Auto-poll:** Every 5 seconds, check if the project has traces in Phoenix. Stop polling after first trace detected or after 5 minutes timeout.
