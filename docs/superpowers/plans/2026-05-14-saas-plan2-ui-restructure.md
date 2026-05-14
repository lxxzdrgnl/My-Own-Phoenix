# Plan 2: UI Restructure — Sidebar Nav + Project Cards + Page Splitting

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace top navigation with sidebar, add project card listing as homepage, split project-view.tsx 3-tab monolith into independent pages under `app/[slug]/`.

**Architecture:** `app/[slug]/layout.tsx` wraps all project pages with a shared sidebar. `app/page.tsx` becomes the project card grid. Each existing tab (Traces, Measure, Risk) and each existing page (Dashboard, Chat, Playground, etc.) becomes its own route under `[slug]/`.

**Tech Stack:** Next.js App Router dynamic routes, existing Sidebar/SidebarItem components, Tailwind

**Depends on:** Plan 1 (Project model exists, `requireProjectAccess` available)

**Spec:** `docs/superpowers/specs/2026-05-14-saas-multi-tenant-design.md` sections 10, 11

---

## File Structure

### New Files
```
app/
  page.tsx                          — Project card grid (homepage)
  [slug]/
    layout.tsx                      — Sidebar + content wrapper
    page.tsx                        — Redirect to dashboard
    dashboard/page.tsx              — Widget grid dashboard (from /dashboard)
    overview/page.tsx               — Stat cards + 12 charts (from project-view Traces tab top)
    requests/page.tsx               — Trace log table (from project-view Traces tab bottom)
    chat/page.tsx                   — Chat (from /)
    playground/page.tsx             — Playground (from /playground)
    evaluations/page.tsx            — Evaluations (from /evaluations)
    measure/page.tsx                — RMF + Gap Analysis (from project-view Measure tab)
    datasets/page.tsx               — Datasets (from /datasets)
    risks/page.tsx                  — Risk management (from project-view Risk tab)
    settings/page.tsx               — Project settings (from /settings, project-scoped)
  settings/
    page.tsx                        — Global settings (Providers, Profile, Templates)
components/
  project-sidebar.tsx               — Sidebar for [slug] layout
  project-card.tsx                  — Single project card component
```

### Deleted Files (after migration)
```
app/projects/                       — Replaced by [slug]/ routes
components/nav.tsx                  — Replaced by project-sidebar.tsx (keep for global settings)
```

### Modified Files
```
app/layout.tsx                      — Remove Nav from global layout
components/ui/sidebar.tsx           — Add collapsible support (icon-only mode)
```

---

### Task 1: Create Project Card Homepage

**Files:**
- Create: `app/page.tsx`
- Create: `components/project-card.tsx`

**What it does:**
- Fetch user's projects via `GET /api/projects`
- Display as card grid (3 columns)
- Each card shows: name, connector status, trace count, eval pass rate, role badge, member count
- Empty state: "Welcome" + [Create Project] + [Join with Code] buttons
- "My Projects" section + "Shared with me" section (grouped by role === "owner" vs others)

**Card design (from spec 11.0):**
- White background, `rounded-xl`, `shadow-sm`
- Top: project name (`font-semibold`)
- Middle: 3 metrics (Traces, Evals, Pass Rate)
- Connector status: `●` green dot (online) / `○` gray (offline)
- Bottom: role badge + member count
- `hover:shadow-md` transition
- Click → navigate to `/{slug}/dashboard`

**Component structure:**
```tsx
// components/project-card.tsx
interface ProjectCardProps {
  name: string;
  slug: string;
  role: string;
  memberCount: number;
  traceCount: number;
  evalCount: number;
  passRate: number | null;
  connectorOnline: boolean;
}
```

```tsx
// app/page.tsx
"use client";
// Fetch from /api/projects
// Group into myProjects (role=owner) and sharedProjects (role!=owner)
// Render ProjectCard grid
// If no projects → EmptyState with Create/Join buttons
```

---

### Task 2: Create [slug] Layout with Sidebar

**Files:**
- Create: `app/[slug]/layout.tsx`
- Create: `components/project-sidebar.tsx`
- Create: `app/[slug]/page.tsx`

**Sidebar structure (from spec 11.3):**
```
┌──────────┐
│ ← Back   │  ← Link to "/"
│          │
│ my-legal │  ← project name
│ -rag     │
│ ● Online │  ← connector status
│──────────│
│ ANALYTICS│  ← SidebarHeader
│ Dashboard│  ← SidebarItem, icon: LayoutDashboard
│ Overview │  ← SidebarItem, icon: BarChart3
│ Requests │  ← SidebarItem, icon: List
│ DEVELOP  │
│ Chat     │  ← SidebarItem, icon: MessageSquare
│Playground│  ← SidebarItem, icon: FlaskConical
│ QUALITY  │
│ Evals    │  ← SidebarItem, icon: SlidersHorizontal
│ Measure  │  ← SidebarItem, icon: Gauge
│ Datasets │  ← SidebarItem, icon: Database
│ Risks    │  ← SidebarItem, icon: ShieldAlert
│──────────│
│ Settings │  ← SidebarItem, icon: Settings2
│──────────│
│ Global ⚙│  ← Link to /settings
└──────────┘
```

**Layout component:**
```tsx
// app/[slug]/layout.tsx
// - Fetch project by slug (server component or client)
// - If not found → notFound()
// - If user not member → redirect to 403 page
// - Render: <ProjectSidebar slug={slug} /> + <main>{children}</main>
// - Full height: h-screen flex
```

**Redirect page:**
```tsx
// app/[slug]/page.tsx
// redirect to /{slug}/dashboard
import { redirect } from "next/navigation";
export default function Page({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}/dashboard`);
}
```

**Access control (from spec 11.3):**
- Not logged in → redirect to login
- Logged in but not member → 403 page with "Access Denied" + [Back to Projects] + [Join Project]
- Not found slug → 404

---

### Task 3: Split project-view.tsx into Dashboard, Overview, Requests

**Files:**
- Create: `app/[slug]/dashboard/page.tsx`
- Create: `app/[slug]/overview/page.tsx`
- Create: `app/[slug]/requests/page.tsx`
- Reference: `app/projects/[name]/project-view.tsx` (source of components to extract)

**Dashboard (`/{slug}/dashboard`):**
- Move existing `app/dashboard/page.tsx` widget grid here
- Same draggable WidgetGrid, same 17 widgets
- Project context from URL slug instead of ProjectSelector

**Overview (`/{slug}/overview`):**
- Extract from project-view.tsx Traces tab TOP section:
  - 4 stat cards (Total Traces, Avg Latency, Avg Score, Pass Rate)
  - 3 charts (Latency Over Time, Avg Score by Annotation, Pass/Fail by Eval)
  - Date range picker at top
- This is the "12 metrics" view

**Requests (`/{slug}/requests`):**
- Extract from project-view.tsx Traces tab BOTTOM section:
  - Search bar
  - Filter toggles (annotation status, latency bands)
  - SpanTreeView component (trace log table)
  - Date range picker

**Key:** Reuse existing components directly. Move, don't rewrite.

---

### Task 4: Move Measure and Risk Tabs to Standalone Pages

**Files:**
- Create: `app/[slug]/measure/page.tsx`
- Create: `app/[slug]/risks/page.tsx`

**Measure (`/{slug}/measure`):**
- Extract MeasureTab content from project-view.tsx
- Components: RMF function cards, MeasureGrid, Gap Analysis
- Same data fetching, just standalone page

**Risks (`/{slug}/risks`):**
- Extract ManageView from project-view.tsx
- Components: RiskItem table, Incident list, stats
- Same data fetching, standalone page

---

### Task 5: Move Chat, Playground, Evaluations, Datasets Under [slug]

**Files:**
- Create: `app/[slug]/chat/page.tsx`
- Create: `app/[slug]/playground/page.tsx`
- Create: `app/[slug]/evaluations/page.tsx`
- Create: `app/[slug]/datasets/page.tsx`

**For each page:**
1. Create new route file under `app/[slug]/`
2. Import the existing main component (e.g., `Assistant` from `app/assistant.tsx`)
3. Pass `slug` as prop instead of using ProjectSelector
4. Remove ProjectSelector from the component (get project from URL param)
5. All data fetching uses projectId resolved from slug

**Chat:** Import `Assistant` component, pass project slug. Remove ProjectSelector.
**Playground:** Import existing playground components. Pass project context.
**Evaluations:** Import `EvaluationsManager`. Pass projectId.
**Datasets:** Import existing dataset components. Pass projectId.

---

### Task 6: Create Project Settings Page

**Files:**
- Create: `app/[slug]/settings/page.tsx`

**Structure (from spec 11.4):**
- Tabbed interface (not sidebar — tabs are: API Keys, Members, Agent, Eval, Chat, Danger Zone)
- API Keys tab: Trace key display + regenerate (owner only)
- Members tab: Team list, invite codes, pending requests → implemented in Plan 4
- Agent tab: Connected agents list → implemented in Plan 6
- Eval tab: Eval worker config (move from current settings)
- Chat tab: Starter questions (move from current settings)
- Danger Zone tab: Delete project (owner only, type name to confirm)

**For now (Plan 2):** Create the page structure with tabs. API Keys tab works. Other tabs show "Coming soon" until Plans 4/6.

---

### Task 7: Update Global Settings Page

**Files:**
- Modify: `app/settings/page.tsx`
- Modify: `app/settings/settings-page.tsx`

**Changes:**
- Remove Phoenix URL section (no longer needed)
- Remove project-specific tabs (Agent, Chat — moved to project settings)
- Keep: Providers tab (LLM API keys)
- Add: Profile tab (name, email from Firebase)
- Add: Connector Key tab (pc_* key display/regenerate — personal key)
- Add: Agent Templates tab (existing, now user-scoped)

**Sidebar tabs:**
```
ACCOUNT
├── Profile
├── Connector Key
└── Providers
TEMPLATES
└── Agent Templates
```

---

### Task 8: Remove Old Navigation and Clean Up

**Files:**
- Delete: `app/projects/` directory (replaced by [slug]/ routes)
- Delete: Old `/dashboard/page.tsx` (moved to [slug]/dashboard)
- Modify: `app/layout.tsx` — remove `<Nav />` from global layout
- Keep: `components/nav.tsx` — still used in global settings page (`/settings`)

**Verification:**
- All routes under `/{slug}/*` work with sidebar
- `/` shows project cards
- `/settings` shows global settings with Nav
- Old URLs (`/projects`, `/dashboard`, `/evaluations`) → 404 or redirect
