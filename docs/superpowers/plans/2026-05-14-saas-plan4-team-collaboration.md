# Plan 4: Team Collaboration — Invite Codes, Join Requests, Roles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable project sharing via invite codes with owner approval. Implement role-based access control (owner/editor/viewer) and ownership transfer.

**Architecture:** Add Prisma models for invite codes and join requests. Create API routes for the invite flow. Build Members tab UI in project settings.

**Tech Stack:** Prisma, Next.js API routes, React, crypto (CSPRNG for codes)

**Depends on:** Plan 1 (Project/ProjectMember models), Plan 2 (project settings page with tabs)

**Spec:** Sections 5, 7, 11.6, 11.8

---

### Task 1: Add Invite Code and Join Request Models

**Files:**
- Modify: `prisma/schema.prisma`

**Models to add:**
```prisma
model ProjectInviteCode {
  id           String    @id @default(cuid())
  projectId    String
  code         String    @unique    // 128-bit, base62, CSPRNG
  role         String    @default("editor")
  maxUses      Int       @default(0)
  useCount     Int       @default(0)
  expiresAt    DateTime?
  createdBy    String
  createdAt    DateTime  @default(now())
  project      Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  joinRequests ProjectJoinRequest[]

  @@unique([projectId, code])
}

model ProjectJoinRequest {
  id        String   @id @default(cuid())
  projectId String
  userId    String
  codeId    String
  status    String   @default("pending")  // pending | approved | rejected
  createdAt DateTime @default(now())
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id])
  code      ProjectInviteCode @relation(fields: [codeId], references: [id])

  @@unique([projectId, userId])
}
```

Add reverse relations to Project and User models. Run migration.

---

### Task 2: Invite Code API

**Files:**
- Create: `app/api/projects/[id]/invite-codes/route.ts`

**Endpoints:**
- `GET /api/projects/[id]/invite-codes` — List codes (owner only)
- `POST /api/projects/[id]/invite-codes` — Generate code (owner only)
  - Body: `{ role: "editor"|"viewer", maxUses: number, expiresInDays: number|null }`
  - Generate: `crypto.randomBytes(16).toString('base62')` (22 chars, 128-bit)
  - Return the code in response (shown once)
- `DELETE /api/projects/[id]/invite-codes?codeId=xxx` — Delete code (owner only)

**Auth:** `requireProjectAccess(req, projectId, "owner")`

---

### Task 3: Join Request API

**Files:**
- Create: `app/api/projects/join/route.ts`
- Create: `app/api/projects/[id]/join-requests/route.ts`

**Join endpoint (`POST /api/projects/join`):**
```
Body: { code: "ABC123..." }
Flow:
1. requireAuth → get userId
2. Find ProjectInviteCode by code
3. Validate: not expired, not maxed out
4. Check user not already a member
5. Create ProjectJoinRequest (status: "pending")
6. Increment useCount
7. Return: { projectName, status: "pending" }
```

**Rate limit:** 5 attempts/min per userId (from Plan 3)

**Approve/Reject endpoint (`PUT /api/projects/[id]/join-requests`):**
```
Body: { requestId, action: "approve"|"reject" }
Auth: owner only
Flow:
  approve → create ProjectMember with role from invite code, set status="approved"
  reject → set status="rejected"
```

**List pending (`GET /api/projects/[id]/join-requests`):**
- Owner only
- Return pending requests with user email/name

---

### Task 4: Member Management API

**Files:**
- Create: `app/api/projects/[id]/members/route.ts`

**Endpoints:**
- `GET /api/projects/[id]/members` — List members (any member can view)
- `PUT /api/projects/[id]/members` — Update role (owner only)
  - Body: `{ userId, role }` — cannot set role to "owner" (use transfer)
- `DELETE /api/projects/[id]/members?userId=xxx` — Remove member (owner only, cannot remove self)

---

### Task 5: Ownership Transfer API

**Files:**
- Modify: `app/api/projects/[id]/members/route.ts` (add PATCH)

**`PATCH /api/projects/[id]/members` — Transfer ownership:**
```
Body: { targetUserId, confirmProjectName }
Auth: owner only
Validation:
  - confirmProjectName must match project.name
  - targetUserId must be existing member
Flow (atomic transaction):
  - Set current owner → role: "editor"
  - Set target → role: "owner"
```

---

### Task 6: Members Tab UI

**Files:**
- Create: `app/[slug]/settings/members-tab.tsx`

**Sections (from spec 11.6):**

**Members list:**
- Table: email, role dropdown (owner sees dropdown, others see text), [Remove] button
- Owner row: shows [Transfer Ownership] button instead
- Role dropdown: viewer, editor options (not owner — that's transfer only)

**Pending Requests (owner only, hidden if empty):**
- List: email, time ago, [Approve] [Reject] buttons
- Fetch from `GET /api/projects/[id]/join-requests`

**Invite Codes (owner only):**
- List: code (masked), role, usage count, expiry, [Copy] [Delete]
- [+ Generate Code] button → inline form:
  - Role: dropdown (editor/viewer)
  - Max uses: number input (0=unlimited)
  - Expires: dropdown (1 day, 7 days, 30 days, Never)
  - [Generate] button
- On generate → auto-copy code to clipboard + show in list

---

### Task 7: Transfer Ownership Modal

**Files:**
- Create: `app/[slug]/settings/transfer-modal.tsx`

**Two-step modal (from spec 11.8):**
1. Step 1: Select target member (radio buttons)
2. Step 2: Confirm — type project name, warning text
3. Submit → PATCH API → refresh page
4. Transfer button disabled until project name matches

---

### Task 8: Join Project Modal

**Files:**
- Create: `components/join-project-modal.tsx`

**Accessible from:**
- Homepage empty state
- Homepage [Join] button

**Flow:**
1. Input field for invite code
2. [Join] button → POST /api/projects/join
3. On success → show "Waiting for owner approval..." state
4. [Close] button

---

### Task 9: Pending Request Notification Badge

**Files:**
- Modify: `components/project-sidebar.tsx`

**In the sidebar Settings item:**
- Fetch pending request count for current project
- If count > 0, show red badge with number on Settings icon
- Owner only — other roles don't see the badge
