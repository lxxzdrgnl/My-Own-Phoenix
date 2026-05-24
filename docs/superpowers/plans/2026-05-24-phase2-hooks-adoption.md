# Phase 2 — Hook Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `useFormSubmit` / `useResourceList` 훅을 ~18곳에 채택하여 `setSaving` + try/catch 보일러플레이트와 수동 fetch + setState 패턴을 제거한다.

**Architecture:** 기존 훅 (`lib/hooks/use-form-submit.ts`, `use-resource-list.ts`)을 일부 보강하고 (useResourceList 에 `transform`/`defaultParams` 옵션 추가) 사용처에서 setSaving/setError 자체 state 를 제거하고 ModalForm/UI 의 saving/error props 를 hook 반환값으로 wiring 한다. **외부 props 시그니처 변경 없음** — 내부 리팩토링.

**Tech Stack:** React 18, TypeScript

**Spec:** `docs/superpowers/specs/2026-05-23-full-refactoring-v2-design.md` Phase 2 (lines 108–152)

**예상 PR 수:** 1

**의존:** Phase 1 (Modal 통합) 머지 완료 — Phase 1 에서 추출된 새 모달들 (create-project / agent-edit / dataset-form) + 마이그레이션된 모달들이 이미 `ModalForm` 사용 중. 본 phase 는 `saving`/`error` wiring 을 hook 반환값으로 교체한다.

**chat-section.tsx:** Phase 4 (대형 파일 분할) 의존 → 본 PR 에서 deferred.

---

## ⚠️ 사전 메모 — 훅 시그니처 / API 확장

### `useFormSubmit` (`lib/hooks/use-form-submit.ts`) — 이미 구현됨, **변경 없음**

```ts
useFormSubmit<T>(
  endpoint: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
  options?: { onSuccess?: (data: any) => void }
): { submit: (data?: T) => Promise<any | null>; saving: boolean; error?: string; setError; clearError }
```

특성:
- `submit(data)` 호출 시 `apiFetch` 으로 호출, 응답 OK 면 `onSuccess(result)`, 실패 시 `error` state 에 메시지 저장
- `endpoint`/`method` 가 동적이어야 하는 경우 (Create vs Edit 분기 등) hook 호출 직전에 변수로 계산해서 그대로 전달 — hook 은 매 render 마다 새 closure 로 submit 을 생성하므로 즉시 반영됨
- spec 2c 에 명시된 `onSuccess` 콜백은 이미 보유 — **추가 보강 불필요**

### `useResourceList` (`lib/hooks/use-resource-list.ts`) — 보강 필요 (Task 1)

기존:
```ts
useResourceList<T>(endpoint: string, dataKey: string = "items")
```

신규:
```ts
interface UseResourceListOptions<T> {
  dataKey?: string;
  transform?: (raw: any) => T[];
  defaultParams?: Record<string, string | number>;
}

useResourceList<T>(endpoint: string, options?: UseResourceListOptions<T> | string)
// 2번째 arg 가 string 이면 backwards-compat (= dataKey 만 지정)
```

---

## File Structure

**보강 (1 파일):**
```
lib/hooks/use-resource-list.ts   # transform + defaultParams 옵션 추가
```

**채택 — 모달 9개 (useFormSubmit):**
```
components/modals/csv-import-modal.tsx
components/modals/annotation-form.tsx
components/modals/prompt-edit-modal.tsx
components/modals/prompts-modal.tsx           # PromptFormModal 만 (PromptsModal 은 리스트, 별도 useResourceList 검토)
components/modals/join-project-modal.tsx
components/modals/create-project-modal.tsx
components/modals/agent-edit-modal.tsx
components/modals/dataset-form-modal.tsx
components/modals/add-diff-to-dataset-dialog.tsx
```

**채택 — non-modal (useFormSubmit):**
```
app/settings/providers-section.tsx
app/settings/general-section.tsx              # savingProfile + savingTemplate (2 form)
app/[slug]/settings/page.tsx                  # 각 탭의 save handler
app/evaluations/eval-editor.tsx
app/evaluations/eval-settings-panel.tsx
components/trace-detail-tabs.tsx
```

**채택 — useResourceList:**
```
app/datasets/dataset-manager.tsx
app/prompts/prompts-manager.tsx
app/settings/agents-section.tsx               # 에이전트 리스트
app/[slug]/settings/page.tsx                  # providers 탭
app/[slug]/settings/members-tab.tsx
app/projects/page.tsx                         # 프로젝트 리스트
```

**제외:**
- `components/modals/auth-modal.tsx` — Phase 1 결과 confirm-style (폼 필드 없음). `useFormSubmit` 부적합.
- `components/modals/add-to-dataset-modal.tsx` — dual submit (existing add vs create) + method 동적 (PUT/POST). `useFormSubmit` 단일 hook 으론 표현 어려움. case-by-case 추후 검토 (dual hook 또는 hook signature 확장).
- `components/modals/eval-selector-modal.tsx` — dual submit (eval 편집 vs 선택 확정). 동일 이유.
- `app/settings/chat-section.tsx` — Phase 4 (분할) 의존.

---

## Task 1: `useResourceList` 보강

**Files:**
- Modify: `lib/hooks/use-resource-list.ts`

- [ ] **Step 1: 파일 수정**

```ts
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";

interface UseResourceListOptions<T> {
  dataKey?: string;
  transform?: (raw: any) => T[];
  defaultParams?: Record<string, string | number>;
}

export function useResourceList<T>(
  endpoint: string,
  optionsOrDataKey?: UseResourceListOptions<T> | string,
) {
  const opts: UseResourceListOptions<T> =
    typeof optionsOrDataKey === "string"
      ? { dataKey: optionsOrDataKey }
      : (optionsOrDataKey ?? {});
  const { dataKey = "items", transform, defaultParams } = opts;

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      let url = endpoint;
      if (defaultParams && Object.keys(defaultParams).length > 0) {
        const qs = new URLSearchParams(
          Object.entries(defaultParams).map(([k, v]) => [k, String(v)]),
        ).toString();
        url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}${qs}`;
      }
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        const arr = transform
          ? transform(data)
          : Array.isArray(data) ? (data as T[]) : ((data[dataKey] ?? []) as T[]);
        setItems(arr);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [endpoint, dataKey, transform, defaultParams]);

  useEffect(() => { void load(); }, [load]);

  return { items, setItems, loading, reload: load };
}
```

**중요:** 1st arg `optionsOrDataKey` 가 string 이면 기존 `dataKey` 의미로 해석 — backwards-compat.

- [ ] **Step 2: `npx tsc --noEmit` PASS**

- [ ] **Step 3: 기존 호출자 정상 동작 확인 (sanity grep)**

```bash
grep -rE 'useResourceList\(' --include="*.tsx" --include="*.ts" -l | head
```
호출자가 있으면 시그니처 호환 확인. 기존 1-arg / 2-arg-string 모두 동작해야 정상.

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/use-resource-list.ts
git commit -m "feat(hooks): useResourceList — transform/defaultParams 옵션 추가"
```

---

## Task 2: `useFormSubmit` 채택 — 모달 9개

각 sub-task 공통 패턴:

**기존 (Phase 1 결과):**
```tsx
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);

async function handleSave() {
  setSaving(true);
  setError(null);
  try {
    const res = await fetch("/api/x", { method: "POST", headers: ..., body: JSON.stringify(data) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error?.message ?? "...");
      return;
    }
    const result = await res.json();
    onSaved?.(result);
    onClose();
  } catch (e) {
    setError(e instanceof Error ? e.message : "Unknown");
  } finally {
    setSaving(false);
  }
}

return (
  <ModalForm open onClose onSubmit={handleSave} saving={saving} error={error} ...>
    {/* fields */}
  </ModalForm>
);
```

**신규:**
```tsx
const { submit, saving, error } = useFormSubmit("/api/x", "POST", {
  onSuccess: (result) => { onSaved?.(result); onClose(); },
});

async function handleSave() {
  await submit(data);
}

return (
  <ModalForm open onClose onSubmit={handleSave} saving={saving} error={error} ...>
    {/* fields */}
  </ModalForm>
);
```

**동적 endpoint (Create vs Edit):**
```tsx
const endpoint = entity ? `/api/x/${entity.id}` : "/api/x";
const method = entity ? "PUT" : "POST";
const { submit, saving, error } = useFormSubmit(endpoint, method, { onSuccess });
```

**중요 규칙:**
- 외부 props (모달 컴포넌트의 props) 시그니처 변경 금지
- `useFormSubmit` 의 `error` 타입은 `string | undefined`. `ModalForm` 의 `error?: string | null` 와 호환 (undefined 도 falsy)
- 만약 모달 내부에서 multiple submit endpoint 또는 method 동적 결정 (body shape에 따라 endpoint 변경 등) 이 필요하면 → DONE_WITH_CONCERNS 보고하고 hook 적용 skip
- 기존 `useState<string | null>` 만 쓰는 error state 도 hook 의 string|undefined 로 자연스럽게 교체
- console.error 잔존 OK (Phase 6 logger 작업)

### 공통 sub-task step (각 파일 적용):

- [ ] Read 파일 → `setSaving` / `setError` 영역 식별, endpoint/method 파악
- [ ] 동적 endpoint 여부 판단:
  - 정적 → 단일 hook
  - Create/Edit 분기 → endpoint/method 변수로 계산하여 단일 hook
  - 그 외 dynamic (body shape 따라 endpoint/method 변화) → skip 후 DONE_WITH_CONCERNS
- [ ] hook 도입 + handler 단순화 + ModalForm props wire
- [ ] `npx tsc --noEmit` PASS
- [ ] Commit (`refactor(hooks): <file> → useFormSubmit`)

### Sub-task 목록 (병렬 가능 — 서로 다른 파일):

- [ ] **Task 2a:** `components/modals/csv-import-modal.tsx`
- [ ] **Task 2b:** `components/modals/annotation-form.tsx`
- [ ] **Task 2c:** `components/modals/prompt-edit-modal.tsx`
- [ ] **Task 2d:** `components/modals/prompts-modal.tsx` (PromptFormModal 만 — PromptsModal 은 리스트라 별도)
- [ ] **Task 2e:** `components/modals/join-project-modal.tsx`
- [ ] **Task 2f:** `components/modals/create-project-modal.tsx`
- [ ] **Task 2g:** `components/modals/agent-edit-modal.tsx` (Create vs Edit 분기)
- [ ] **Task 2h:** `components/modals/dataset-form-modal.tsx` (Create vs Edit 분기)
- [ ] **Task 2i:** `components/modals/add-diff-to-dataset-dialog.tsx`

각 commit 메시지 예:
```bash
git commit -m "refactor(hooks): csv-import-modal → useFormSubmit"
```

---

## Task 3: `useFormSubmit` 채택 — non-modal

같은 패턴이지만 ModalForm 없이 페이지 내 saving/error UI 처리.

**UI binding (ModalForm 없이):**
- 저장 버튼: `<Button onClick={handleSave} disabled={saving}>{saving ? "저장 중..." : "저장"}</Button>`
- 에러 표시: `{error && <p className="text-sm text-[#ef4444]">{error}</p>}`

(LoadingButton / InlineError 도입은 Phase 3 작업 — 본 task 에서는 그대로 두기)

### Sub-task 목록 (병렬):

- [ ] **Task 3a:** `app/settings/providers-section.tsx`
  - provider 추가/편집/삭제 form
  - 여러 endpoint 가능 (POST 추가, DELETE) — hook 다수 사용
- [ ] **Task 3b:** `app/settings/general-section.tsx`
  - `savingProfile` + `savingTemplate` (2 form) — useFormSubmit × 2
- [ ] **Task 3c:** `app/[slug]/settings/page.tsx`
  - 각 탭 (ApiKeys, Members 등) save handler — useFormSubmit × N
- [ ] **Task 3d:** `app/evaluations/eval-editor.tsx`
- [ ] **Task 3e:** `app/evaluations/eval-settings-panel.tsx`
- [ ] **Task 3f:** `components/trace-detail-tabs.tsx`

각 sub-task step:
- [ ] Read 파일 → 모든 setSaving 영역 식별 (여러 form 가능)
- [ ] form 별 hook 도입
- [ ] saving/error UI binding (button disabled + 인라인 error)
- [ ] tsc PASS
- [ ] Commit

---

## Task 4: `useResourceList` 채택

기존 패턴 (각 호출자):
```tsx
const [items, setItems] = useState<T[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  apiFetch("/api/x").then(r => r.json()).then(data => {
    setItems(data.items ?? []);
    setLoading(false);
  }).catch(() => setLoading(false));
}, []);

// 갱신 시: setItems / re-fetch
```

신규 패턴:
```tsx
const { items, setItems, loading, reload } = useResourceList<T>("/api/x");
// 또는 옵션:
const { items } = useResourceList<T>("/api/x", { dataKey: "datasets" });
const { items } = useResourceList<T>("/api/x", {
  transform: (raw) => raw.datasets.map((d: any) => ({ ...d, parsed: JSON.parse(d.headers) })),
});
const { items } = useResourceList<T>("/api/x", {
  defaultParams: { limit: 100 },
});
```

### Sub-task 목록 (병렬):

- [ ] **Task 4a:** `app/datasets/dataset-manager.tsx`
- [ ] **Task 4b:** `app/prompts/prompts-manager.tsx`
- [ ] **Task 4c:** `app/settings/agents-section.tsx` (에이전트 리스트만)
- [ ] **Task 4d:** `app/[slug]/settings/page.tsx` (providers 탭 리스트)
- [ ] **Task 4e:** `app/[slug]/settings/members-tab.tsx`
- [ ] **Task 4f:** `app/projects/page.tsx` (프로젝트 리스트)

각 sub-task step:
- [ ] Read 파일 → fetch + setItems + setLoading 영역 식별
- [ ] useResourceList 도입 (필요 시 dataKey / transform / defaultParams)
- [ ] 기존 state / useEffect 제거 + items / loading / reload 사용
- [ ] 갱신 (생성/삭제 후) → `reload()` 호출 또는 `setItems` 직접 조작
- [ ] tsc PASS
- [ ] Commit (`refactor(hooks): X → useResourceList`)

---

## Task 5: Build + Smoke + PR

- [ ] **Step 1: 전체 빌드**
  ```bash
  npm run build
  ```
  Expected: PASS

- [ ] **Step 2: tsc**
  ```bash
  npx tsc --noEmit
  ```
  Expected: PASS

- [ ] **Step 3: smoke test (수동)**
  - 모달 9개 한 번씩 열고 저장 (success) + 의도된 에러 (e.g., 필수 필드 비우고 제출) → saving 표시 / error 표시 정상
  - 리스트 6곳 로딩 정상, 추가/삭제 후 갱신 정상
  - 설정 페이지 form 저장 정상

- [ ] **Step 4: PR 생성**
  - title: `refactor: Phase 2 — useFormSubmit / useResourceList 채택`
  - body: spec / plan 참조 + 채택 파일 list + 제외 사유

---

## 실행 권장 순서

1. **Task 1** (hook 보강) — 우선. 다른 task 들이 보강된 옵션을 쓸 수 있게.
2. **Task 2 (모달 9개)** — 병렬 dispatch. 서로 독립.
3. **Task 3 (non-modal)** — 병렬 dispatch. 서로 독립.
4. **Task 4 (useResourceList)** — 병렬 dispatch. 서로 독립.
5. **Task 5** — build + PR.

Phase 1 패턴 그대로:
- 병렬 dispatch (서로 다른 파일)
- 통합 review (Build + tsc + spot check) 1회
- 개별 spec/code-quality review 생략 (사용자 요청 — 시간 절약)

## Out of Scope

- `chat-section.tsx` (Phase 4 분할 의존)
- `auth-modal.tsx` (Phase 1 결과 confirm-style)
- `add-to-dataset-modal.tsx`, `eval-selector-modal.tsx` (dual submit — useFormSubmit 부적합)
- `useFormSubmit` 의 signature 확장 (현재 onSuccess 만으로 충분; dual submit hook 확장은 별도 spec 필요)
- `LoadingButton` / `InlineError` / `Heading`/`Text` 도입 (Phase 3)
- API 응답 envelope 통일 (Phase 5)
