# Full Refactoring V2 Design Spec

**Date**: 2026-05-23
**Predecessor**: `2026-05-15-full-refactoring-design.md` (대부분 구현 완료, 본 spec은 후속편)
**Scope**: 모달 통합, 미채택 훅 확산, 컴포넌트 재사용, 대형 파일 분할, 백엔드 API 일관성, dead code 2차, 문서/컨벤션 codification

---

## 배경 (Context)

2026-05-15 spec의 8개 Phase 중 다음은 이미 완료됨:
- Phase 1 dead code (1차) · Phase 2 보안 · Phase 3 auth `authedHandler` 통일 (50/50 route) · Phase 4 DB 스키마 · Phase 5 훅 **파일 생성** (`lib/hooks/use-form-submit.ts`, `use-resource-list.ts`) · Phase 6 일부 (`ConfirmDialog` 12곳 채택) · Phase 7 폴더 구조 일부 (`components/modals/`) · Phase 8 일부 파일 분할.

미해결/회귀 발견:
1. **모달 시스템 이중화**: 커스텀 `components/ui/modal.tsx` (11곳) + Radix `components/ui/dialog.tsx` (2곳) 공존. a11y 부족.
2. **훅은 만들어졌지만 0건 채택**: `useFormSubmit` / `useResourceList` — 기존 18+ 곳이 여전히 `setSaving`+try/catch 보일러플레이트.
3. **대형 파일 잔존/신규**: `lib/phoenix.ts` 834줄, `lib/openapi-spec.ts` 778줄 (이전 spec에서 분할 예정이었으나 미완), `components/span-tree-view.tsx` 767, `prompt-builder.tsx` 681, `dataset-manager.tsx` 662, `trace-detail-tabs.tsx` 616, `app/settings/chat-section.tsx` 618.
4. **API 응답/에러 포맷 일관성 검증 안 됨**: route 수가 50개로 늘어남.
5. **컨벤션 미문서화**: 새 작업이 패턴을 어기는 회귀 위험.

---

## Phase 1 — Modal 통합

### 1a. 표준 선택: Radix Dialog
- 폐기: `components/ui/modal.tsx` (custom, focus trap·ESC·ARIA 없음)
- 유지: `components/ui/dialog.tsx` (Radix Primitive, 접근성 OK)

### 1b. `ModalShell` 호환 래퍼
기존 11곳의 호출 시그니처(`<Modal open onClose>...`)를 보존하기 위해 Radix Dialog 위에 얇은 래퍼를 둠. 마이그레이션이 거의 drop-in.

```typescript
// components/ui/modal-shell.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog";

export function ModalShell({ open, onClose, children, className, size = "md" }: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizeClass = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(sizeClass, className)}>{children}</DialogContent>
    </Dialog>
  );
}

export function ModalHeader({ title, description }: { title: string; description?: string }) {
  return <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <p className="text-sm text-muted-foreground">{description}</p>}</DialogHeader>;
}

export function ModalBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("py-2", className)}>{children}</div>;
}
```

### 1c. `ModalForm` 폼 모달 표준
저장/취소/loading/error footer를 표준화.

```typescript
// components/ui/modal-form.tsx
export function ModalForm({ open, onClose, onSubmit, title, description, saving, error, submitLabel = "저장", children, size }: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  title: string;
  description?: string;
  saving?: boolean;
  error?: string | null;
  submitLabel?: string;
  size?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
}) {
  return (
    <ModalShell open={open} onClose={onClose} size={size}>
      <ModalHeader title={title} description={description} />
      <ModalBody>{children}</ModalBody>
      {error && <p className="text-sm text-red-500 px-1">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose} disabled={saving}>취소</Button>
        <Button onClick={onSubmit} disabled={saving}>{saving ? "저장 중..." : submitLabel}</Button>
      </div>
    </ModalShell>
  );
}
```

### 1d. 위치 통일
다음 모달들을 `components/modals/`로 이동:
- `components/join-project-modal.tsx` → `components/modals/join-project-modal.tsx`
- `app/projects/page.tsx` 인라인 → `components/modals/create-project-modal.tsx`
- `app/settings/agents-section.tsx` 인라인 → `components/modals/agent-edit-modal.tsx`
- `app/datasets/dataset-manager.tsx` 인라인 → `components/modals/dataset-form-modal.tsx`

`components/modals/index.ts`에 모두 re-export.

### 1e. 마이그레이션
1. 모든 모달 파일을 `ModalShell` import로 교체 (`Modal` → `ModalShell`)
2. 폼 모달 (annotation-form, prompt-edit-modal, csv-import-modal, add-to-dataset-modal, eval-selector-modal 등) → `ModalForm`으로 변환, footer 코드 삭제
3. `components/ui/modal.tsx` 삭제
4. `auth-modal.tsx`, `attachment.tsx`의 직접 `dialog.tsx` 사용도 `ModalShell`로 정규화

---

## Phase 2 — 훅 채택 (useFormSubmit / useResourceList)

### 2a. `useFormSubmit` 적용 대상

| 파일 | 현재 패턴 | 적용 |
|---|---|---|
| `app/settings/agents-section.tsx` | setSaving+try/catch | useFormSubmit |
| `app/settings/providers-section.tsx` | 동일 | useFormSubmit |
| `app/settings/general-section.tsx` | savingProfile/savingTemplate 2개 | useFormSubmit × 2 |
| `app/settings/chat-section.tsx` | 분할 후 각 sub-section | useFormSubmit |
| `app/[slug]/settings/page.tsx` 각 탭 | setSaving | useFormSubmit |
| `components/modals/annotation-form.tsx` | setSaving | useFormSubmit (ModalForm `saving`/`error`로 wiring) |
| `components/modals/prompt-edit-modal.tsx` | 동일 | useFormSubmit |
| `components/modals/csv-import-modal.tsx` | 동일 | useFormSubmit |
| `components/modals/add-to-dataset-modal.tsx` | 동일 | useFormSubmit |
| `components/modals/eval-selector-modal.tsx` | 동일 | useFormSubmit |
| `components/modals/auth-modal.tsx` | 동일 | useFormSubmit |
| `components/join-project-modal.tsx` | 동일 | useFormSubmit |
| `app/projects/page.tsx` create | 동일 | useFormSubmit |
| `components/prompt-builder.tsx` save | 동일 | useFormSubmit |
| `app/evaluations/eval-editor.tsx` save | 동일 | useFormSubmit |

`useFormSubmit` 시그니처에 `onSuccess` 콜백이 없으면 추가:
```typescript
function useFormSubmit<T>(submitFn: (data: T) => Promise<Response>, opts?: { onSuccess?: (result: unknown) => void })
```

### 2b. `useResourceList` 적용 대상

| 파일 | 현재 | 적용 |
|---|---|---|
| `app/datasets/dataset-manager.tsx` | 수동 fetch+state | useResourceList |
| `app/prompts/prompts-manager.tsx` | 수동 | useResourceList |
| `app/settings/agents-section.tsx` 에이전트 리스트 | 수동 | useResourceList |
| `app/[slug]/settings/page.tsx` providers 탭 | 수동 | useResourceList |
| `app/projects/page.tsx` 프로젝트 리스트 | 수동 | useResourceList |
| `app/[slug]/settings/members-tab.tsx` | 수동 | useResourceList |
| 그 외 grep 으로 발견된 list 패턴 | — | 케이스별 |

### 2c. 채택 전 훅 보강
구현 단계에서 부족한 옵션 추가:
- `useFormSubmit`: `onSuccess(result)` 콜백
- `useResourceList`: optional `transform`, optional `defaultParams`

---

## Phase 3 — Design System Layer (Typography · Section · Layout · 재사용)

본 phase의 목표: 모달처럼 **폰트·섹션·페이지 레이아웃**도 공통 모듈로 묶어 ad-hoc Tailwind 클래스 반복을 제거하고 단일 소스로 통합. 현재 `text-lg/xl/2xl + font-semibold/bold` 패턴이 474곳에 산재 → 의미 단위 컴포넌트로 표준화.

### 3a. 타이포그래피 컴포넌트 (`components/ui/typography.tsx`)

```typescript
// Heading: 페이지/섹션/서브섹션 위계 표준화
<Heading level="page">     // text-2xl font-semibold tracking-tight
<Heading level="section">  // text-lg font-semibold
<Heading level="sub">      // text-sm font-semibold uppercase tracking-wider text-muted-foreground

// Text: 본문/캡션
<Text variant="body">      // text-sm
<Text variant="caption">   // text-xs text-muted-foreground
<Text variant="mono">      // font-mono text-xs
<Text variant="lead">      // text-base text-muted-foreground

// Label: 폼 라벨 (form-field와 통합)
<Label required>...</Label>
```

규칙:
- 의미 단위로 import (`<Heading>`, `<Text>`) — raw `<h1>/<p>` + Tailwind 텍스트 클래스 금지
- 색상은 토큰 기반 (`text-foreground`, `text-muted-foreground`, `text-destructive`)만 허용
- 474곳 ad-hoc 사용처 단계적 치환 (PR 분할 가능)

### 3b. Section/Page 레이아웃 컴포넌트

**`components/ui/section-card.tsx` 확장**

현재는 `{title, description, children}`만. 확장:
```typescript
<SectionCard
  title="LLM Provider Keys"
  description="..."
  actions={<Button>추가</Button>}      // 우측 액션 슬롯
  variant="default" | "destructive" | "bordered"
  divider                                // 헤더와 본문 사이 구분선
>
  ...
</SectionCard>
```

**신규 `components/ui/page-header.tsx`**

페이지 상단 헤더 표준 (현재 각 페이지가 ad-hoc div+text 조합):
```typescript
<PageHeader
  title="Datasets"
  description="Test datasets and runs."
  actions={<Button>New</Button>}
  breadcrumb={[{label, href}, ...]}
/>
```

**신규 `components/ui/page-container.tsx`**

페이지 최외곽 컨테이너 (max-width / padding / vertical spacing 통일):
```typescript
<PageContainer size="default" | "wide" | "narrow">
  <PageHeader ... />
  <SectionCard ... />
</PageContainer>
```

**신규 `components/ui/stack.tsx`**

세로/가로 간격 표준 (`gap-2/3/4/6/8` 반복 제거):
```typescript
<Stack gap="md">...</Stack>      // 세로
<Inline gap="sm">...</Inline>    // 가로
```

### 3c. 폼/인풋 표준화

- `components/ui/form-field.tsx` 이미 존재 — label+input+error 통합. 채택 확산.
- 신규 `components/ui/loading-button.tsx`: `<LoadingButton loading={saving}>저장</LoadingButton>` (현재 11+ 곳이 `disabled={saving}` + 텍스트 분기 반복)
- 신규 `components/ui/inline-error.tsx`: `<InlineError>{msg}</InlineError>` (현재 `text-sm text-red-500` 반복)

### 3d. 신규 ProviderRow 추출

프로젝트 설정 (`app/[slug]/settings/page.tsx` ApiKeysTab)과 글로벌 설정 (`app/settings/providers-section.tsx`)의 provider 행이 거의 동일 → 추출.

```typescript
<ProviderKeyRow
  provider={provider}
  onTest={handleTest}
  onDelete={handleDelete}
  showProject={false}
/>
```

### 3e. 디자인 토큰 정리

`app/globals.css` 토큰은 잘 정의됨 (CSS vars 기반). 추가 정리:
- **금지 색**: monotone palette rule 강제 — `text-blue-500`, `bg-indigo-*` 등 임의 색상 grep → 토큰 또는 허용된 `#10b981`/`#ef4444`로 교체
- **반복되는 magic number 정리**: `tracking-widest`, `text-[10px]` 등 raw 값을 토큰화하거나 컴포넌트 prop으로 흡수
- **간격 스케일**: `gap-2/3/4/6/8` 사용 규칙 → `Stack`/`Inline` gap prop으로 흡수

### 3f. 기존 컴포넌트 채택 확산

이미 존재하지만 사용처 적음 → grep 후 적극 도입:
- `empty-state.tsx` (LoadingState + EmptyState 포함)
- `form-field.tsx`
- `role-gate.tsx` (viewer 권한 게이트)

### 3g. 채택 전략

타이포그래피 치환은 474곳에 달하므로 phase 내 sub-PR로 분할:
- Sub-PR A: typography components 작성 + `app/settings/*` 적용
- Sub-PR B: `app/[slug]/*` 적용
- Sub-PR C: `app/datasets`, `app/playground`, `app/evaluations` 적용
- Sub-PR D: 나머지 + lint rule (Tailwind raw text-X 사용 금지) 추가

---

## Phase 4 — 큰 파일 분할

### 4a. `lib/phoenix.ts` (834줄) → `lib/phoenix/` 모듈

```
lib/phoenix/
  types.ts          # Trace, Annotation, PromptVersion, PromptInfo, ComparisonResult, Project, RawSpan, TraceTree, PromptTag, GuardrailDetection 등 인터페이스
  guardrail.ts      # parseGuardrailDetections, computeHasGuardrailTriggered
  traces.ts         # fetchTraces, fetchTraceTrees, deleteTrace
  prompts.ts        # fetchPrompts, fetchPromptVersions, fetchPromptsWithVersions, fetchScopedPromptsWithVersions, fetchPromptVersionTags, addPromptVersionTag, deletePromptVersionTag, createPrompt, updatePrompt, deletePrompt
  llm.ts            # callLLM
  projects.ts       # fetchProjects
  helpers.ts        # normalizeContent
  index.ts          # 전체 public API re-export (외부 import path 호환)
```

외부 `from "@/lib/phoenix"` 호출자 변경 불필요 — barrel 유지.

### 4b. `lib/openapi-spec.ts` (778줄) → `lib/openapi/`

```
lib/openapi/
  index.ts          # 베이스 spec + 도메인 paths 머지 + MY_PHENIX_INFO + SECURITY_SCHEMES + ERROR_SCHEMAS
  auth.ts           # /api/auth/*
  projects.ts       # /api/projects/*
  datasets.ts       # /api/datasets/*
  providers.ts      # /api/providers/*
  evals.ts          # /api/eval-*
  observability.ts  # /api/feedback, /api/collect, /api/sse/*
  threads.ts        # /api/user-threads/*
```

`/api/openapi.json/route.ts`에서 `import { spec } from "@/lib/openapi"` 사용.

### 4c. `components/span-tree-view.tsx` (767) → 분할

```
components/trace-tree/
  span-tree-view.tsx       # 메인 view 컴포넌트 (state + 레이아웃)
  span-tree-node.tsx       # 단일 노드 (재귀)
  span-style.ts            # SPAN_STYLES, getSpanStyle, StatusIcon
  span-tree-helpers.ts     # formatSec, walk helpers
  index.ts
```

기존 import path는 호출자 일괄 갱신 (`@/components/span-tree-view` → `@/components/trace-tree`). 호환용 re-export 파일은 두지 않음 (dead code 양산 방지).

### 4d. `components/prompt-builder.tsx` (681) → 분할

builder 본체 + 각 단계(prompt fields, variables, examples) 컴포넌트로 분리. 디렉터리: `components/prompt-builder/`.

### 4e. `app/datasets/dataset-manager.tsx` (662) → 분할

이전 spec에서 계획된 그대로:
- `dataset-manager.tsx` — 오케스트레이터 (~200줄)
- `dataset-sidebar.tsx` — 리스트
- `dataset-toolbar.tsx` — 액션 버튼

### 4f. `components/trace-detail-tabs.tsx` (616) → 분할

탭 컴포넌트 별로 분리:
- `trace-detail-tabs.tsx` — 탭 컨테이너
- `tabs/input-output-tab.tsx`
- `tabs/annotations-tab.tsx`
- `tabs/attributes-tab.tsx`
- `tabs/evaluations-tab.tsx`
- 그 외 발견되는 탭

### 4g. `app/settings/chat-section.tsx` (618) → 분할

설정 그룹 별로 분리:
- `chat-section.tsx` — 오케스트레이터
- `chat-runtime-config.tsx`
- `chat-message-config.tsx`
- 그 외 발견되는 그룹

### 4h. 임계치 정책
분할 임계 = **500줄**. 500을 넘으면 책임이 너무 많다는 신호 → 분할 검토. (CLAUDE.md 컨벤션으로 명시 — Phase 8)

---

## Phase 5 — 백엔드 API consistency

### 5a. 50개 route 감사 체크리스트

각 route 파일에 대해:
1. **Auth**: `authedHandler` 사용 ✓ (현재 50/50 — 회귀 방지)
2. **에러 응답**: `apiError(req, ErrorCode.X, msg)` 사용 — raw `NextResponse.json({error}, {status})` 금지
3. **권한**: project-scoped route는 `requireProjectMember` 사용
4. **입력 검증**: body parsing 시 명시적 검증 (zod 또는 수동 type guard)
5. **응답 포맷**: 통일 (아래 5b 참조)
6. **페이지네이션**: 통일 (아래 5c 참조)

### 5b. 응답 포맷 정책 결정

현재 혼재 패턴:
- 어떤 route는 raw object 반환: `return NextResponse.json(thread)`
- 어떤 route는 envelope: `return NextResponse.json({ data: thread })`
- 어떤 route는 array를 직접: `return NextResponse.json(traces)`

**결정**: 단일 리소스는 raw, 리스트는 envelope `{ items, total?, nextCursor? }`. 이유: 리스트는 메타데이터(페이지네이션 등) 동반 필요, 단일 리소스는 envelope 불필요.

감사 단계에서 각 route를 이 규칙에 맞게 정규화.

### 5c. 페이지네이션 표준
쿼리 파라미터 통일:
- `limit` (default 50, max 200)
- `cursor` (opaque string) 또는 `page` + `pageSize` — 한쪽으로 통일
- **결정**: cursor 우선 (Prisma `take`/`cursor` 호환), 단순 리스트는 limit만

응답: `{ items, nextCursor }`.

### 5d. 공통 listing helper

```typescript
// lib/api-helpers.ts
export function parsePagination(req: NextRequest): { limit: number; cursor?: string } {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 50), 200);
  const cursor = sp.get("cursor") ?? undefined;
  return { limit, cursor };
}

export function paginatedResponse<T>(items: T[], take: number, getCursor: (last: T) => string) {
  const hasMore = items.length > take;
  const slice = hasMore ? items.slice(0, take) : items;
  return { items: slice, nextCursor: hasMore ? getCursor(slice[slice.length - 1]) : null };
}
```

### 5e. 산출물
- 감사 결과 표 (route × 체크리스트) — spec 별첨 또는 PR 본문에
- 각 위반 사항을 fix 커밋으로 분리

---

## Phase 6 — Dead code 2차

### 6a. 자동 스캔
- `knip` 1회 실행 (또는 `ts-prune`) → 미사용 export 리스트
- 결과를 검토하여 false positive 제거 후 일괄 정리

### 6b. 알려진 후보
- 최근 8일간 추가된 미사용 export
- `.claude/worktrees/agent-*` 디렉터리 (오래된 worktree 잔재) — 사용자에게 정리 권유 (자동 삭제는 위험)
- 사용처 0건인 컴포넌트
- 사용처 0건인 lib 유틸

### 6c. 정리 원칙
- export 했지만 사용처 없음 → 삭제
- 파일 전체가 dead → 삭제
- 외부 API 일부일 가능성 있는 lib (예: `phoenix-server.ts`)은 보존 (worker/connector에서 사용 가능)

---

## Phase 7 — 문서 갱신

### 7a. `README.md`
- 본 리팩토링 결과 폴더 구조 반영
- Quick Start (Docker Compose) 검증
- Architecture 짧은 다이어그램 (Mermaid 또는 ASCII)

### 7b. `app/docs/sections/api.tsx`
50개 route를 그룹별로 문서화:
- Projects & Members
- Providers & Keys
- Datasets & Runs
- Evaluations
- Observability (Collect, SSE, Annotations, Feedback)
- Chat & Threads
- Infrastructure (Health, Docs proxy)

---

## Phase 8 — 영구 하네스 (Permanent Hybrid Enforcement)

**배경**: 이전 human-eval 구현 때 Claude가 기존 패턴을 무시하고 자기 마음대로 새로 만들어버린 사례 발생. 단순 `CLAUDE.md`는 무시될 여지가 있어 **하이브리드 하네스**(soft 주입 + hard 차단)를 구축한다.

**중요 — 영구성**:
- 본 하네스는 본 리팩토링 라운드 전용이 아닌 **프로젝트 영구 인프라**
- `.claude/settings.json` + `.claude/hooks/*.py` 모두 **git에 커밋**
- 새로 clone하거나 새 개발자/AI 세션이 프로젝트에 진입하면 **자동 활성화**
- 향후 새 컨벤션이 생기면 hook 규칙에 추가하여 누적 강화 가능

### 8a-0. `.gitignore` 수정 (선결 조건)

현재 `CLAUDE.md`가 gitignored → 팀원/새 세션에서 로드 안 됨. 수정 필요:

```diff
# .gitignore
 # claude
-CLAUDE.md
 .claude/worktrees/
+.claude/settings.local.json
```

`CLAUDE.md`, `.claude/settings.json`, `.claude/hooks/`를 **추적**. 사용자별 설정만 `.claude/settings.local.json`(local)으로 격리.

### 8a. `CLAUDE.md` 컨벤션 문서 (Soft layer)

루트 `CLAUDE.md` 작성. Claude Code가 세션마다 자동 로드.

```markdown
# My Own Phoenix — 작업 컨벤션 (필수 준수)

## ⚠️ 핵심 원칙: NEVER INVENT
새 모달/훅/컴포넌트/라우트를 만들기 전, MUST 다음을 수행:
1. 비슷한 기존 파일이 있는지 grep
2. 발견 시 → 재사용 또는 확장
3. 발견 못한 경우만 → 사용자에게 새로 만들 이유 확인

## Modals
- `ModalShell` / `ModalForm`만 사용 (`components/ui/modal-shell.tsx`)
- 새 모달 파일은 `components/modals/`에 두고 `index.ts`에 export
- 금지: 폐기된 `components/ui/modal.tsx`, 페이지/컴포넌트 안의 인라인 모달

## Forms
- 저장/제출은 `useFormSubmit` (`lib/hooks/use-form-submit.ts`)
- 금지: 수동 `setSaving` + try/catch 보일러플레이트

## CRUD Lists
- `useResourceList` (`lib/hooks/use-resource-list.ts`)

## Typography
- `<Heading level="page|section|sub">`, `<Text variant="body|caption|mono">` 사용
- 금지: raw `text-lg/xl/2xl` + `font-semibold/bold` 직접 사용

## Layout
- `<PageContainer>`, `<PageHeader>`, `<SectionCard>`, `<Stack>`, `<Inline>` 사용

## API Routes
- 인증: `authedHandler`
- 에러: `apiError(req, ErrorCode.X, msg)` (raw `NextResponse.json({error})` 금지)
- 권한: project-scoped는 `requireProjectMember`
- 응답: 단일 리소스 raw, 리스트는 `{ items, nextCursor }`
- 페이지네이션: `parsePagination(req)`

## Imports
- Phoenix lib: `@/lib/phoenix`만 (서브모듈 직접 import X)
- OpenAPI: `@/lib/openapi`만

## File Size
- 500줄 초과 → 분할 검토

## Colors
- monotone palette + `#10b981` / `#ef4444`만 (다른 hex/Tailwind 색 추가 금지)
```

### 8b. SessionStart hook — 컨벤션 컨텍스트 주입

`.claude/hooks/session-start-conventions.py`:

```python
#!/usr/bin/env python3
"""세션 시작 시 컨벤션 요약을 컨텍스트에 강제 주입."""
import json, sys
CONVENTIONS = """⚠️ MY-OWN-PHOENIX 컨벤션 (위반 시 PreToolUse hook이 차단):
1. NEVER INVENT — 새 컴포넌트/훅/라우트 만들기 전 grep으로 기존 것 확인 필수
2. Modal: ModalShell/ModalForm만 / Form: useFormSubmit / List: useResourceList
3. Typography: <Heading>/<Text> (raw text-lg/xl + font-semibold 금지)
4. API: authedHandler + apiError + requireProjectMember
5. Imports: @/lib/phoenix, @/lib/openapi barrel만
6. File > 500 lines → 분할
자세한 내용: CLAUDE.md"""
print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": CONVENTIONS}}))
```

### 8c. PreToolUse hook — Hard block (forbidden patterns)

`.claude/hooks/pre-tool-convention-check.py`:

Write/Edit tool 호출 시 `tool_input`을 검사하여 다음 위반 발견 시 차단:

| 위반 | 차단 메시지 |
|---|---|
| `import.*from\s+["']@/components/ui/modal["']` (삭제된 파일) | "modal.tsx는 삭제됨. `@/components/ui/modal-shell`의 ModalShell 사용" |
| `app/api/.*` 파일에 raw `NextResponse\.json\(\s*\{\s*error\s*:` | "apiError(req, ErrorCode.X, msg) 사용" |
| `app/api/.*` 파일에 `requireAuth\(` (authedHandler 외부) | "authedHandler 래퍼 사용" |
| 새 `.tsx` 파일에 `<.*\sclassName=["'].*text-(lg\|xl\|2xl\|3xl).*font-(semibold\|bold)` | "Heading/Text 컴포넌트 사용. 직접 타이포 클래스 금지" |
| 새 modal 파일이 `components/modals/` 밖에 생성 | "components/modals/ 안에 만들고 index.ts에 export" |
| `phoenix-` 외 `lib/phoenix/.*` 서브모듈 직접 import (`@/lib/phoenix/traces` 등) | "@/lib/phoenix barrel만 import" |

```python
#!/usr/bin/env python3
import json, sys, re

data = json.load(sys.stdin)
tool = data.get("tool_name", "")
if tool not in ("Write", "Edit"):
    sys.exit(0)

ti = data.get("tool_input", {})
fp = ti.get("file_path", "")
content = ti.get("content") or ti.get("new_string", "")

RULES = [
    (r'from\s+["\']@/components/ui/modal["\']',
     "❌ modal.tsx는 삭제됨. @/components/ui/modal-shell의 ModalShell 사용"),
    (r'NextResponse\.json\s*\(\s*\{\s*error\s*:',
     "❌ raw error JSON 금지. apiError(req, ErrorCode.X, msg) 사용",
     lambda fp: fp.startswith("app/api/") or "/api/" in fp),
    (r'\brequireAuth\s*\(',
     "❌ requireAuth 직접 사용 금지. authedHandler 래퍼 사용",
     lambda fp: "/api/" in fp),
    (r'className=["\'][^"\']*\btext-(lg|xl|2xl|3xl)\b[^"\']*\bfont-(semibold|bold)\b',
     "❌ raw 타이포 클래스 금지. <Heading level=...> 사용"),
    (r'from\s+["\']@/lib/phoenix/(?!index)[a-z]+["\']',
     "❌ @/lib/phoenix 서브모듈 직접 import 금지. barrel(@/lib/phoenix)만 사용"),
]

# 경로 정규화: 절대 경로 → 프로젝트 상대로
import os
PROJECT_ROOT = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
rel_fp = os.path.relpath(fp, PROJECT_ROOT) if os.path.isabs(fp) else fp

violations = []
for rule in RULES:
    pattern, msg = rule[0], rule[1]
    guard = rule[2] if len(rule) > 2 else (lambda _: True)
    if guard(rel_fp) and re.search(pattern, content):
        violations.append(msg)

# New modal file outside components/modals/
if (data.get("tool_name") == "Write"
    and re.search(r'modal', fp, re.IGNORECASE)
    and fp.endswith(".tsx")
    and not fp.startswith("components/modals/")
    and not fp.endswith("modal-shell.tsx")
    and not fp.endswith("modal-form.tsx")):
    violations.append(f"❌ 새 모달 파일은 components/modals/ 안에 만들기. 현재: {fp}")

if violations:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": "\n".join(violations) + "\n\nCLAUDE.md 컨벤션 확인 후 재시도."
        }
    }))
    sys.exit(0)
```

### 8d. Pre-implementation gate — "NEVER INVENT" 사전 차단

`.claude/hooks/pre-new-file-gate.py`:

Write tool이 **신규 파일** 생성 시 (Edit은 통과), 다음을 자동 grep하여 유사 기존 파일이 있으면 차단:

```python
# 새 컴포넌트 (.tsx in components/) → components/ 전체 grep
# 새 훅 (lib/hooks/use-*.ts) → lib/hooks/ + 다른 use-* grep
# 새 API 라우트 (app/api/*/route.ts) → 비슷한 path grep
# 새 lib 유틸 (.ts in lib/) → lib/ 전체 grep
```

차단 메시지:
```
❌ 새 파일 생성 차단 — 비슷한 기존 파일 발견:
  - components/ui/section-card.tsx
  - components/ui/empty-state.tsx
재사용 또는 확장 가능한지 확인 후, 정말 새 파일이 필요하면
다음과 같이 Bash로 토큰을 우회: echo 'PRE_NEW_FILE_GATE_BYPASS=<이유>'
```

우회 방법: 환경변수 + 사유 명시 (이력 추적 가능). 사용자가 직접 hook 비활성화 옵션도 제공.

### 8e. PostToolUse hook — Soft warnings

`.claude/hooks/post-edit-warn.py`:

Edit/Write 직후 그 파일을 다시 스캔하여 soft 위반 발견 시 Claude에게 경고 메시지 출력 (차단 X):

| 경고 |
|---|
| setSaving 패턴 발견 (useFormSubmit 미사용) |
| try/catch 만으로 fetch 에러 처리 (useFormSubmit 미사용) |
| 파일 줄 수 > 500 |
| `if (!confirm(...))` (ConfirmDialog/useConfirm 미사용) |
| TODO/FIXME 신규 추가 |

출력은 PostToolUse 결과로 Claude에게 보이며, 다음 turn에서 인지하고 수정할 수 있음.

### 8f. `.claude/settings.json` 등록

```json
{
  "hooks": {
    "SessionStart": [
      {"matcher": "*", "hooks": [{"type": "command", "command": ".claude/hooks/session-start-conventions.py"}]}
    ],
    "PreToolUse": [
      {"matcher": "Write|Edit", "hooks": [
        {"type": "command", "command": ".claude/hooks/pre-tool-convention-check.py"},
        {"type": "command", "command": ".claude/hooks/pre-new-file-gate.py"}
      ]}
    ],
    "PostToolUse": [
      {"matcher": "Write|Edit", "hooks": [{"type": "command", "command": ".claude/hooks/post-edit-warn.py"}]}
    ]
  }
}
```

### 8g. 점진적 활성화 전략
하네스가 Phase 1-7 작업 중 자기 자신을 차단하면 진행 불가 → 단계적 적용:
1. Phase 1-7 전체 완료 후 hook 작성 (`modal.tsx` 등이 실제 삭제된 상태여야 차단 룰이 의미 있음)
2. 먼저 SessionStart + PostToolUse만 활성화 (warning only) — 1주 관찰
3. 위반이 줄어들면 PreToolUse 차단 활성화
4. Pre-new-file gate는 마지막에 (가장 짜증날 가능성) — 사용자 토글 가능하게

### 8h. 사용자 토글 옵션
환경변수로 hook 단계 토글:
- `PHOENIX_HARNESS=off` → 모든 hook 비활성
- `PHOENIX_HARNESS=soft` → SessionStart + PostToolUse만 (기본값 권장)
- `PHOENIX_HARNESS=strict` → 전부 활성 (PreToolUse 차단 + new-file gate)

`.claude/settings.json` hook 스크립트 첫 줄에서 변수 체크 후 조용히 종료.

### 8i. 디버깅 가능성
- 모든 hook은 `.claude/hooks/log/YYYY-MM-DD.log`에 결정과 사유를 append
- 차단 시 사용자가 로그로 원인 추적 가능
- 로그 디렉토리는 gitignore 추가: `.claude/hooks/log/`

### 8j. 영구 유지 / 확장성

**유지 책임**: 향후 새 컨벤션(예: 새 상태관리 라이브러리 도입, 새 폼 패턴 표준)이 정해지면 다음을 동시에 갱신:
1. `CLAUDE.md` — 인간 가독 컨벤션
2. `.claude/hooks/pre-tool-convention-check.py` — RULES 리스트에 차단 룰 추가
3. `.claude/hooks/post-edit-warn.py` — soft 경고 룰 추가
4. `.claude/hooks/session-start-conventions.py` — 요약 메시지에 항목 추가

**문서**: `.claude/hooks/README.md` 추가하여 hook 구조·rule 추가법·디버깅법 설명.

**테스트**: `.claude/hooks/__tests__/` 디렉토리에 각 rule의 positive/negative 케이스. 정기적으로 수동 실행하여 hook이 의도대로 작동하는지 확인.

**확장 예시**: 새 hook이 필요할 때 추가하는 방식:
```python
# 새 룰 추가 예시 (RULES 리스트에 한 줄)
(r'console\.log\s*\(', "❌ console.log 금지. logger 사용", lambda fp: fp.endswith(".ts") or fp.endswith(".tsx")),
```

### 8k. 산출물 요약

| 파일 | 역할 | git tracked |
|---|---|---|
| `CLAUDE.md` | 인간 가독 컨벤션, Claude 세션 auto-load | ✓ |
| `.claude/settings.json` | hook 등록 + 권한 | ✓ |
| `.claude/settings.local.json` | 사용자별 오버라이드 | ✗ |
| `.claude/hooks/session-start-conventions.py` | 컨벤션 컨텍스트 주입 | ✓ |
| `.claude/hooks/pre-tool-convention-check.py` | hard block 룰 | ✓ |
| `.claude/hooks/pre-new-file-gate.py` | NEVER INVENT 사전 차단 | ✓ |
| `.claude/hooks/post-edit-warn.py` | soft 경고 | ✓ |
| `.claude/hooks/README.md` | hook 구조·확장 가이드 | ✓ |
| `.claude/hooks/__tests__/*` | rule 테스트 케이스 | ✓ |
| `.claude/hooks/log/` | 실행 로그 (gitignored) | ✗ |
| `.gitignore` | `CLAUDE.md` 제거, `.claude/settings.local.json` 추가 | ✓ |

---

## Implementation Order & Risk

| Phase | 설명 | Risk | 의존 | 예상 PR 수 |
|---|---|---|---|---|
| 1 | Modal 통합 (ModalShell + ModalForm + 위치 통일 + modal.tsx 삭제) | Medium (11파일 마이그) | — | 1 |
| 2 | 훅 채택 (useFormSubmit / useResourceList) | Low | Phase 1 | 2 (form / list) |
| 3 | Design System Layer (Typography + Section + Layout + 재사용) | Low | — | 4 sub-PR (A/B/C/D) |
| 4 | 큰 파일 분할 (phoenix, openapi, span-tree, prompt-builder, dataset-manager, trace-detail, chat-section) | Medium (import path) | Phase 1, 2 | 3 (lib / components / app) |
| 5 | API consistency (50 route 감사 + 응답·페이지네이션 표준) | Medium | — | 2 (감사 / fix) |
| 6 | Dead code 2차 (knip + 수동 정리) | Low | Phase 4 | 1 |
| 7 | 문서 (README + API docs section) | None | Phase 1-6 | 1 |
| 8 | 영구 하네스 (CLAUDE.md + .claude/hooks + .gitignore) | Low (스크립트 작성) | Phase 1-7 (룰이 의미 있는 상태에서 활성화) | 3 (CLAUDE.md / hooks 스크립트 / 점진 활성화) |

총 ~17 PR (또는 phase 묶어서 더 적게).

---

## Out of Scope
- DB 스키마 변경 (이전 spec에서 완료)
- 보안 hardening (이전 spec에서 완료)
- 새 기능 추가 (refactor only — 동작 보존)
- UX 변경 (모달의 시각적 변화는 Radix 기본 스타일에 한정, 사용자 노출 동작 변경 없음)

## 검증 전략
- 테스트 인프라 빈약 (guardrail 테스트 2개만 존재)
- 각 Phase 후: `npm run build` (Next.js + TS 검사) + 핵심 UI 경로 수동 확인
- Phase 1 (모달) 완료 후: 모든 모달 한 번씩 열어보기
- Phase 4 (파일 분할) 완료 후: import 경로 깨짐 없는지 build 통과 확인
- Phase 5 (API) 완료 후: 주요 route curl smoke test
