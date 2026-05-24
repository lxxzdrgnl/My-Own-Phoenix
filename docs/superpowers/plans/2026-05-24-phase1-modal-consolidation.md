# Phase 1 — Modal Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Radix Dialog 기반 `ModalShell`/`ModalForm` 표준 컴포넌트를 만들고, 폐기 대상 `components/ui/modal.tsx` 를 사용하는 10곳 + Radix `dialog.tsx` 를 직접 사용하는 2곳 + 인라인 모달 3곳을 모두 마이그레이션해 `components/ui/modal.tsx`를 삭제한다.

**Architecture:** Radix Dialog 위의 얇은 wrapper(`ModalShell`) — focus trap·ESC·ARIA를 무료로 얻음. 폼 모달은 saving/error/footer 를 추상화한 `ModalForm` 사용. 모든 모달 파일은 `components/modals/` (또는 표준 컴포넌트는 `components/ui/`) 안에 위치하고 `components/modals/index.ts` 에서 barrel re-export. `ConfirmDialog` 외부 시그니처는 보존하고 내부만 ModalShell로 교체 (12 호출자 자동 수혜).

**Tech Stack:** Next.js 14 (app router), React 18, Radix UI Dialog (`@radix-ui/react-dialog`), Tailwind CSS, TypeScript

**Spec:** `docs/superpowers/specs/2026-05-23-full-refactoring-v2-design.md` — Phase 1 (lines 23–105). 실행 순서표 #2.

**예상 PR 수:** 1 (마이그레이션 본체) + 1 (Harness Stage 1 활성)

**⚠️ 사전 메모 — API 비호환:**
현재 `Modal`/`ModalHeader`/`ModalBody` 시그니처는 신규 `ModalShell` 와 **drop-in 호환되지 않는다**. 특히:

| 현재 (`components/ui/modal.tsx`) | 신규 (`components/ui/modal-shell.tsx`) |
|---|---|
| `<Modal open onClose [className] [z]>` | `<ModalShell open onClose [size] [className]>` |
| `<ModalHeader onClose={...}>제목</ModalHeader>` (children=title, X 버튼 내장) | `<ModalHeader title="제목" description="..." />` (X 버튼은 Radix DialogContent가 자동 제공) |
| `<ModalBody>` (스크롤, p-5) | `<ModalBody>` (py-2, 스크롤 없음 — 콘텐츠가 길면 DialogContent overflow 사용) |
| `className="w-[640px]"` 등 raw width | `size="sm|md|lg|xl"` prop |

따라서 각 호출 site에서 JSX 본문도 함께 변환해야 한다. import 교체만으로 끝나지 않는다.

---

## File Structure

**신규 (Task 1–2):**
```
components/ui/
  modal-shell.tsx      # ModalShell + ModalHeader + ModalBody (Radix wrap)
  modal-form.tsx       # ModalForm (저장/취소/loading/error footer 표준)
```

**삭제 (Task 8):**
```
components/ui/modal.tsx
```

**이동 (Task 6):**
```
components/join-project-modal.tsx → components/modals/join-project-modal.tsx
```

**신설 (Task 7) — 인라인 추출:**
```
components/modals/
  create-project-modal.tsx       # app/projects/page.tsx 에서 추출
  agent-edit-modal.tsx           # app/settings/agents-section.tsx 에서 추출
  dataset-form-modal.tsx         # app/datasets/dataset-manager.tsx 에서 추출
```

**수정 (Task 3–5):**
```
components/ui/confirm-dialog.tsx                # 내부 modal → ModalShell (외부 API 보존)
components/modals/csv-import-modal.tsx          # → ModalForm
components/modals/add-to-dataset-modal.tsx      # → ModalForm
components/modals/annotation-form.tsx           # → ModalForm
components/modals/prompts-modal.tsx             # → ModalShell or ModalForm (확인)
components/modals/prompt-edit-modal.tsx         # → ModalForm (현재 dialog.tsx 사용 여부 step 1 확인)
components/modals/add-diff-to-dataset-dialog.tsx # → ModalShell
components/modals/eval-selector-modal.tsx       # → ModalForm
components/modals/auth-modal.tsx                # 직접 dialog.tsx → ModalShell/ModalForm
components/assistant-ui/attachment.tsx          # 직접 dialog.tsx → ModalShell
components/modals/index.ts                      # 신규 모달 re-export 추가
```

---

## Task 1: `ModalShell` 컴포넌트 작성

**Files:**
- Create: `components/ui/modal-shell.tsx`

- [ ] **Step 1: 파일 생성**

`components/ui/modal-shell.tsx`:

```tsx
"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./dialog";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<Size, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

export function ModalShell({
  open,
  onClose,
  children,
  className,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  size?: Size;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(SIZE_CLASS[size], className)}>{children}</DialogContent>
    </Dialog>
  );
}

export function ModalHeader({ title, description }: { title: string; description?: string }) {
  return (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      {description && <DialogDescription>{description}</DialogDescription>}
    </DialogHeader>
  );
}

export function ModalBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("py-2", className)}>{children}</div>;
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS (모달 호출 site는 아직 안 건드림)

- [ ] **Step 3: Commit**

```bash
git add components/ui/modal-shell.tsx
git commit -m "feat(ui): ModalShell - Radix Dialog wrapper with size variants"
```

---

## Task 2: `ModalForm` 컴포넌트 작성

**Files:**
- Create: `components/ui/modal-form.tsx`

- [ ] **Step 1: 파일 생성**

`components/ui/modal-form.tsx`:

```tsx
"use client";

import * as React from "react";
import { ModalShell, ModalHeader, ModalBody } from "./modal-shell";
import { Button } from "./button";

type Size = "sm" | "md" | "lg" | "xl";

export function ModalForm({
  open,
  onClose,
  onSubmit,
  title,
  description,
  saving,
  error,
  submitLabel = "저장",
  cancelLabel = "취소",
  size,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  title: string;
  description?: string;
  saving?: boolean;
  error?: string | null;
  submitLabel?: string;
  cancelLabel?: string;
  size?: Size;
  children: React.ReactNode;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSubmit();
  };

  return (
    <ModalShell open={open} onClose={onClose} size={size}>
      <form onSubmit={handleSubmit}>
        <ModalHeader title={title} description={description} />
        <ModalBody>{children}</ModalBody>
        {error && <p className="text-sm text-[#ef4444] px-1 pt-1">{error}</p>}
        <div className="flex justify-end gap-2 pt-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {cancelLabel}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "저장 중..." : submitLabel}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
```

**노트:**
- spec(line 81)은 `text-red-500` 이지만 CLAUDE.md monotone palette 규칙에 따라 `#ef4444` 사용
- `<form>` 으로 감싸서 Enter 키 제출 지원 (현재 모달 다수가 Enter 안 됨)
- `cancelLabel` 추가 — "취소" 외 "Close" 등 다른 라벨이 필요한 경우 대비

- [ ] **Step 2: Button import 위치 확인**

Run: `ls components/ui/button.tsx && grep -E "^export" components/ui/button.tsx`
Expected: `export { Button, ... }` 존재. 없으면 import 경로 조정.

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/ui/modal-form.tsx
git commit -m "feat(ui): ModalForm - 폼 모달 표준 (saving/error/footer)"
```

---

## Task 3: `ConfirmDialog` 내부 마이그레이션 (modal → ModalShell)

**Files:**
- Modify: `components/ui/confirm-dialog.tsx`

`ConfirmDialog` 는 12곳에서 사용 중 — 외부 시그니처를 **반드시 보존**한다.

- [ ] **Step 1: 현재 파일 읽고 시그니처 파악**

Read `components/ui/confirm-dialog.tsx` — 외부 props 인터페이스 기록.

- [ ] **Step 2: 내부만 교체**

변환 패턴:
```diff
-import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
+import { ModalShell, ModalHeader, ModalBody } from "@/components/ui/modal-shell";

-<Modal open={open} onClose={onClose} className="w-[480px]">
-  <ModalHeader onClose={onClose}>{title}</ModalHeader>
+<ModalShell open={open} onClose={onClose} size="sm">
+  <ModalHeader title={title} description={description} />
   <ModalBody>
     {message}
   </ModalBody>
   {/* footer 그대로 */}
-</Modal>
+</ModalShell>
```

`description`/`message` 매핑은 현재 props 구조에 맞춰 조정. ConfirmDialog 가 자체 footer (확인/취소 버튼) 를 갖고 있으면 그대로 유지.

- [ ] **Step 3: 12 호출자 회귀 확인**

Run: `grep -rE 'ConfirmDialog' --include="*.tsx" --include="*.ts" -l | head -20`
각 호출자 props 가 그대로 동작하는지 시각적으로 확인 (시그니처 변경 없음 → 작동해야 정상).

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/ui/confirm-dialog.tsx
git commit -m "refactor(ui): ConfirmDialog 내부 modal → ModalShell (외부 API 보존)"
```

---

## Task 4: `components/modals/` 기존 모달 마이그레이션

각 파일을 sub-task 로 분리. 변환 패턴은 공통:

**공통 변환 패턴 — 폼 모달 (ModalForm 사용):**

```diff
-import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
-// (Button, useState[saving], try/catch 보일러플레이트 제거)
+import { ModalForm } from "@/components/ui/modal-form";

-<Modal open={open} onClose={onClose} className="w-[600px]">
-  <ModalHeader onClose={onClose}>제목</ModalHeader>
-  <ModalBody>
-    {/* 폼 필드 */}
-    {error && <p className="text-red-500">{error}</p>}
-    <div className="flex justify-end gap-2 mt-4">
-      <Button variant="ghost" onClick={onClose}>취소</Button>
-      <Button onClick={handleSave} disabled={saving}>{saving ? "..." : "저장"}</Button>
-    </div>
-  </ModalBody>
-</Modal>
+<ModalForm
+  open={open}
+  onClose={onClose}
+  onSubmit={handleSave}
+  title="제목"
+  saving={saving}
+  error={error}
+  size="md"
+>
+  {/* 폼 필드만 남음 */}
+</ModalForm>
```

**공통 변환 패턴 — 비폼 모달 (ModalShell 사용):**

```diff
-import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
+import { ModalShell, ModalHeader, ModalBody } from "@/components/ui/modal-shell";

-<Modal open={open} onClose={onClose} className="w-[800px]">
-  <ModalHeader onClose={onClose}>제목</ModalHeader>
+<ModalShell open={open} onClose={onClose} size="lg">
+  <ModalHeader title="제목" />
   <ModalBody>{/* ... */}</ModalBody>
-</Modal>
+</ModalShell>
```

**className width → size 매핑:**
- `w-[400px]` 이하 → `size="sm"` (max-w-md)
- `w-[480px] ~ w-[640px]` → `size="md"` (max-w-lg)
- `w-[700px] ~ w-[850px]` → `size="lg"` (max-w-2xl)
- `w-[900px] +` → `size="xl"` (max-w-4xl)

확신이 안 서면 `size="md"` 기본값 + 필요 시 `className="sm:max-w-[NNNpx]"` 로 미세 조정.

**노트 — useFormSubmit:**
Phase 2 에서 본격 채택하지만, ModalForm 으로 변환하면서 `saving`/`error` state 가 자연스럽게 ModalForm props 로 들어간다. 기존 `setSaving` + try/catch 패턴은 그대로 두되, ModalForm 의 `saving`/`error` prop 에 wiring 만 한다. (useFormSubmit 훅 채택은 Phase 2 작업.)

### Task 4a: `csv-import-modal.tsx` → ModalForm

**Files:**
- Modify: `components/modals/csv-import-modal.tsx`

- [ ] **Step 1: 현재 파일 읽기**

Read `components/modals/csv-import-modal.tsx` — props, state, JSX 구조 파악.

- [ ] **Step 2: 위 공통 패턴 (폼 모달) 적용**

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`

- [ ] **Step 4: 사용처 확인 (props 시그니처 변경 없으면 변경 없음)**

Run: `grep -rE 'CSVImportModal' --include="*.tsx" -l`
호출자 변경 필요 없으면 그대로.

- [ ] **Step 5: Commit**

```bash
git add components/modals/csv-import-modal.tsx
git commit -m "refactor(modals): csv-import-modal → ModalForm"
```

### Task 4b: `add-to-dataset-modal.tsx` → ModalForm

Files: `components/modals/add-to-dataset-modal.tsx`

- [ ] **Step 1:** Read 후 Task 4a 와 동일 패턴 적용
- [ ] **Step 2:** 타입 체크
- [ ] **Step 3:** Commit
  ```bash
  git commit -m "refactor(modals): add-to-dataset-modal → ModalForm"
  ```

### Task 4c: `annotation-form.tsx` → ModalForm

Files: `components/modals/annotation-form.tsx`

- [ ] **Step 1:** Read — annotation-form 은 다른 곳에서 inline 임베드로도 쓸 가능성 확인 (`AnnotationForm` 호출 site grep)
- [ ] **Step 2:** 모달 wrapper 부분만 ModalForm 화. 폼 본체가 inline 으로도 쓰이면 `AnnotationFormFields` 같은 sub-컴포넌트로 분리하고 ModalForm 은 그걸 감싸는 wrapper 로 둠.
- [ ] **Step 3:** 타입 체크
- [ ] **Step 4:** Commit
  ```bash
  git commit -m "refactor(modals): annotation-form → ModalForm"
  ```

### Task 4d: `prompts-modal.tsx` (PromptsModal + PromptFormModal)

Files: `components/modals/prompts-modal.tsx`

- [ ] **Step 1:** Read — 이 파일은 두 export (`PromptsModal`, `PromptFormModal`) 가 있음. 각각 폼/비폼 판단.
- [ ] **Step 2:** `PromptsModal` (리스트/선택) → ModalShell. `PromptFormModal` (생성/편집) → ModalForm.
- [ ] **Step 3:** 타입 체크
- [ ] **Step 4:** Commit
  ```bash
  git commit -m "refactor(modals): prompts-modal → ModalShell/ModalForm"
  ```

### Task 4e: `prompt-edit-modal.tsx` → ModalForm

Files: `components/modals/prompt-edit-modal.tsx`

- [ ] **Step 1:** Read — modal.tsx vs dialog.tsx 둘 다 안 쓸 수도 있음 (앞서 grep 결과에 없었음). 확인 후 패턴 결정.
- [ ] **Step 2:** ModalForm 으로 통일.
- [ ] **Step 3:** 타입 체크
- [ ] **Step 4:** Commit
  ```bash
  git commit -m "refactor(modals): prompt-edit-modal → ModalForm"
  ```

### Task 4f: `add-diff-to-dataset-dialog.tsx` → ModalShell or ModalForm

Files: `components/modals/add-diff-to-dataset-dialog.tsx`

- [ ] **Step 1:** Read — "dialog" 라는 이름이지만 modal.tsx import 중. 폼인지 확인.
- [ ] **Step 2:** 폼이면 ModalForm, 단순 표시면 ModalShell.
- [ ] **Step 3:** 타입 체크
- [ ] **Step 4:** Commit
  ```bash
  git commit -m "refactor(modals): add-diff-to-dataset-dialog → Modal{Shell|Form}"
  ```

### Task 4g: `eval-selector-modal.tsx` → ModalForm

Files: `components/modals/eval-selector-modal.tsx`

- [ ] **Step 1:** Read
- [ ] **Step 2:** ModalForm 적용
- [ ] **Step 3:** 타입 체크
- [ ] **Step 4:** Commit
  ```bash
  git commit -m "refactor(modals): eval-selector-modal → ModalForm"
  ```

---

## Task 5: `dialog.tsx` 직접 사용 정규화

### Task 5a: `auth-modal.tsx`

**Files:**
- Modify: `components/modals/auth-modal.tsx`

- [ ] **Step 1: 현재 파일 읽기**

Read `components/modals/auth-modal.tsx` — Radix `Dialog`/`DialogContent` 직접 사용 패턴 파악. 로그인 폼이므로 ModalForm 후보.

- [ ] **Step 2: ModalForm 으로 교체**

변환 패턴:
```diff
-import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
+import { ModalForm } from "@/components/ui/modal-form";

-<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
-  <DialogContent>
-    <DialogHeader><DialogTitle>로그인</DialogTitle></DialogHeader>
-    {/* 폼 */}
-    {/* footer */}
-  </DialogContent>
-</Dialog>
+<ModalForm
+  open={open}
+  onClose={onClose}
+  onSubmit={handleLogin}
+  title="로그인"
+  saving={saving}
+  error={error}
+  submitLabel="로그인"
+  size="sm"
+>
+  {/* 폼 필드만 */}
+</ModalForm>
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add components/modals/auth-modal.tsx
git commit -m "refactor(modals): auth-modal 직접 dialog → ModalForm"
```

### Task 5b: `attachment.tsx`

**Files:**
- Modify: `components/assistant-ui/attachment.tsx`

- [ ] **Step 1: 현재 파일 읽기**

Read `components/assistant-ui/attachment.tsx` — Radix Dialog 사용 부분 파악. 이미지/파일 프리뷰 모달일 가능성 (비폼).

- [ ] **Step 2: ModalShell 로 교체**

```diff
-import { Dialog, DialogContent, ... } from "@/components/ui/dialog";
+import { ModalShell } from "@/components/ui/modal-shell";

-<Dialog open={...} onOpenChange={...}>
-  <DialogContent className="sm:max-w-2xl">
+<ModalShell open={...} onClose={...} size="lg">
     {/* 프리뷰 콘텐츠 */}
-  </DialogContent>
-</Dialog>
+</ModalShell>
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add components/assistant-ui/attachment.tsx
git commit -m "refactor(assistant-ui): attachment 직접 dialog → ModalShell"
```

---

## Task 6: `join-project-modal.tsx` 위치 이동

**Files:**
- Move: `components/join-project-modal.tsx` → `components/modals/join-project-modal.tsx`
- Modify: `components/modals/index.ts`
- Modify: 모든 호출자 (import path 갱신)

- [ ] **Step 1: 현재 파일 읽기**

Read `components/join-project-modal.tsx` — props, JSX 구조 파악. modal.tsx 사용 중이므로 동시에 ModalForm 화.

- [ ] **Step 2: 파일 이동 (git mv)**

```bash
git mv components/join-project-modal.tsx components/modals/join-project-modal.tsx
```

- [ ] **Step 3: 파일 내용 ModalForm 화**

Task 4 의 공통 패턴 (폼 모달) 적용. 프로젝트 join 은 폼이므로 ModalForm.

- [ ] **Step 4: `components/modals/index.ts` 에 export 추가**

```diff
 export { AnnotationForm } from "./annotation-form";
+export { JoinProjectModal } from "./join-project-modal";
```

- [ ] **Step 5: 호출자 import path 갱신**

```bash
grep -rE 'from\s+["\x27](@/components/join-project-modal|\.\./join-project-modal|\./join-project-modal)["\x27]' --include="*.tsx" --include="*.ts" -l
```

각 호출자에서:
```diff
-import { JoinProjectModal } from "@/components/join-project-modal";
+import { JoinProjectModal } from "@/components/modals";
```

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS — 깨지는 import 없음

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(modals): join-project-modal → components/modals/ + ModalForm"
```

---

## Task 7: 인라인 모달 추출

### Task 7a: `app/projects/page.tsx` 생성 모달 → `create-project-modal.tsx`

**Files:**
- Create: `components/modals/create-project-modal.tsx`
- Modify: `app/projects/page.tsx`
- Modify: `components/modals/index.ts`

- [ ] **Step 1: 현재 인라인 모달 찾기**

Read `app/projects/page.tsx` — `<Modal>` 또는 `<Dialog>` 인라인 JSX 블록 찾기. modal.tsx 사용 중이므로 `<Modal>` 으로 시작하는 JSX 블록.

- [ ] **Step 2: 새 파일 생성**

`components/modals/create-project-modal.tsx`:

```tsx
"use client";

import * as React from "react";
import { ModalForm } from "@/components/ui/modal-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// ... 기타 필요 import (page.tsx 에서 사용 중인 폼 필드 컴포넌트)

export function CreateProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (project: { id: string; name: string }) => void;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message ?? "프로젝트 생성 실패");
        return;
      }
      const created = await res.json();
      onCreated?.(created);
      setName("");
      setDescription("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      title="새 프로젝트"
      saving={saving}
      error={error}
      size="sm"
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="proj-name">이름</Label>
          <Input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <Label htmlFor="proj-desc">설명</Label>
          <Input id="proj-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
    </ModalForm>
  );
}
```

**노트:** page.tsx 의 인라인 로직과 동일한 동작 보장. 실제 필드/검증/API 호출 패턴은 page.tsx 에서 그대로 옮긴다 (위는 예시 스켈레톤).

- [ ] **Step 3: `app/projects/page.tsx` 에서 인라인 제거 + import**

```diff
-{showCreate && (
-  <Modal open={showCreate} onClose={() => setShowCreate(false)}>
-    {/* 인라인 폼 + state + handler */}
-  </Modal>
-)}
+<CreateProjectModal
+  open={showCreate}
+  onClose={() => setShowCreate(false)}
+  onCreated={(p) => { /* 리스트 갱신 등 */ }}
+/>
```

import:
```diff
+import { CreateProjectModal } from "@/components/modals";
-import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
```

- [ ] **Step 4: index.ts export**

```diff
+export { CreateProjectModal } from "./create-project-modal";
```

- [ ] **Step 5: 타입 체크 + 동작 확인**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(projects): 인라인 생성 모달 → CreateProjectModal 추출"
```

### Task 7b: `app/settings/agents-section.tsx` → `agent-edit-modal.tsx`

**Files:**
- Create: `components/modals/agent-edit-modal.tsx`
- Modify: `app/settings/agents-section.tsx`
- Modify: `components/modals/index.ts`

- [ ] **Step 1:** Read `app/settings/agents-section.tsx` — 인라인 모달 영역 파악. agent 추가/편집 폼.

- [ ] **Step 2:** `components/modals/agent-edit-modal.tsx` 생성. props 예시:
```typescript
{
  open: boolean;
  onClose: () => void;
  agent?: Agent;  // 없으면 신규, 있으면 편집
  onSaved?: (agent: Agent) => void;
}
```
ModalForm 사용.

- [ ] **Step 3:** `agents-section.tsx` 에서 인라인 제거 + `<AgentEditModal>` 호출로 교체. modal.tsx import 제거.

- [ ] **Step 4:** `index.ts` 에 `AgentEditModal` export 추가.

- [ ] **Step 5:** 타입 체크

- [ ] **Step 6:** Commit
  ```bash
  git commit -m "refactor(settings): agents-section 인라인 모달 → AgentEditModal"
  ```

### Task 7c: `app/datasets/dataset-manager.tsx` → `dataset-form-modal.tsx`

**Files:**
- Create: `components/modals/dataset-form-modal.tsx`
- Modify: `app/datasets/dataset-manager.tsx`
- Modify: `components/modals/index.ts`

- [ ] **Step 1:** Read `app/datasets/dataset-manager.tsx` — 인라인 모달 영역 파악. 앞선 grep 에서 `modal.tsx` import 는 안 잡혔으므로 dialog 직접 사용 또는 다른 패턴일 가능성. 확인 후 변환 결정.

- [ ] **Step 2:** `components/modals/dataset-form-modal.tsx` 생성. dataset 생성/편집 폼 → ModalForm.

- [ ] **Step 3:** `dataset-manager.tsx` 에서 인라인 제거.

- [ ] **Step 4:** `index.ts` 에 `DatasetFormModal` export 추가.

- [ ] **Step 5:** 타입 체크

- [ ] **Step 6:** Commit
  ```bash
  git commit -m "refactor(datasets): dataset-manager 인라인 모달 → DatasetFormModal"
  ```

---

## Task 8: `modal.tsx` 삭제

**Files:**
- Delete: `components/ui/modal.tsx`

- [ ] **Step 1: 잔재 import 검증**

Run:
```bash
grep -rE 'from\s+["\x27]@/components/ui/modal["\x27]' --include="*.tsx" --include="*.ts"
```
Expected: 결과 0건. 결과가 있으면 Task 3–7 로 돌아가서 누락 마이그레이션 처리.

- [ ] **Step 2: 잔재 export name 검증**

Run:
```bash
grep -rE '\b(Modal)\b' --include="*.tsx" --include="*.ts" -n | grep -v "ModalShell\|ModalForm\|ModalHeader\|ModalBody" | grep -vE "//|node_modules" | head
```
의도하지 않은 잔재가 있으면 정리. (변수명 `modal` 같은 false positive 무시.)

- [ ] **Step 3: 파일 삭제**

```bash
git rm components/ui/modal.tsx
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(ui): modal.tsx 삭제 (모든 사용처 ModalShell 마이그레이션 완료)"
```

---

## Task 9: Build + 수동 smoke test

**Files:** (변경 없음, 검증만)

- [ ] **Step 1: 전체 빌드**

Run: `npm run build`
Expected: PASS — TypeScript + Next.js 빌드 통과

- [ ] **Step 2: dev 서버 기동**

Run: `npm run dev`
브라우저: `http://localhost:3000`

- [ ] **Step 3: 모달 smoke test 체크리스트**

각 모달을 한 번씩 열고 (1) 열림 (2) ESC 로 닫힘 (3) 백드롭 클릭으로 닫힘 (4) 폼 모달은 Enter 키로 제출 됨 확인:

- [ ] `/projects` — 새 프로젝트 모달 (CreateProjectModal)
- [ ] `/projects` — 프로젝트 합류 모달 (JoinProjectModal)
- [ ] `/settings` Agents 탭 — Agent 편집 모달 (AgentEditModal)
- [ ] `/datasets` — dataset 생성 모달 (DatasetFormModal)
- [ ] `/datasets` — CSV 임포트 (CSVImportModal)
- [ ] `/datasets` — add to dataset (AddToDatasetModal)
- [ ] `/datasets` — add diff to dataset (AddDiffToDatasetDialog)
- [ ] `/prompts` — 프롬프트 편집 (PromptEditModal, PromptFormModal)
- [ ] `/playground` — annotation form (AnnotationForm)
- [ ] `/playground` — eval selector (EvalSelectorModal)
- [ ] `/playground` — 로그인 모달 (AuthModal) — 로그아웃 상태에서
- [ ] 첨부 프리뷰 (assistant-ui attachment)
- [ ] ConfirmDialog 호출처 1곳 이상 (삭제 확인 등)

- [ ] **Step 4: 회귀 발견 시 수정 → 추가 commit**

발견된 회귀는 각각 별도 fix commit. plan 진행 중 발견된 사항은 본 task 안에서 처리.

- [ ] **Step 5: 마이그레이션 본체 PR 생성 (사용자 확인 후)**

본 시점까지 commit 들을 묶어서 PR 생성. PR 제목: `refactor(modals): Phase 1 모달 통합 (ModalShell/ModalForm)`

---

## Task 10: Harness Stage 1 활성 (별도 PR)

본 task 는 Phase 1 마이그레이션 PR 가 머지된 **이후** 별도 PR 로 진행.

**Files:**
- Modify: `.claude/hooks/pre-tool-convention-check.py` (또는 `.claude/settings.json`의 STAGE 환경변수)

- [ ] **Step 1: 현재 hook 의 STAGE 설정 확인**

Read `.claude/hooks/pre-tool-convention-check.py` — 룰별 stage gate 위치 파악. spec 9g 에 따르면 STAGE 환경변수 또는 상수로 제어.

- [ ] **Step 2: Stage 1 활성 조건 풀기**

스펙 (9g, Stage 1) 에 따라 다음 룰을 hard block 으로 활성:
- `@/components/ui/modal` import 금지 (modal.tsx 가 삭제됐으므로 이미 깨지지만, 명시적 차단 메시지가 더 친절)
- 신규 모달 파일이 `components/modals/` 밖에 생성되는 것 차단

```python
# 예시 — 룰에 stage gate 추가
STAGE = int(os.environ.get("PHOENIX_HARNESS_STAGE", "1"))  # 0 → 1로 승급

RULES_STAGE_1 = [
    (r'from\s+["\']@/components/ui/modal["\']',
     "❌ modal.tsx 는 삭제됨. @/components/ui/modal-shell 의 ModalShell 사용"),
]
```

- [ ] **Step 3: settings.json 의 STAGE env 갱신**

```diff
 "env": {
-  "PHOENIX_HARNESS_STAGE": "0"
+  "PHOENIX_HARNESS_STAGE": "1"
 }
```

- [ ] **Step 4: hook 테스트 (positive/negative)**

- Positive: 새 파일에 `import ... from "@/components/ui/modal"` 시도 → 차단되어야 함
- Negative: `import ... from "@/components/ui/modal-shell"` → 통과해야 함

(`.claude/hooks/__tests__/` 에 케이스 추가)

- [ ] **Step 5: Commit + PR**

```bash
git add .claude/hooks/ .claude/settings.json
git commit -m "feat(harness): Stage 1 활성 — modal import / 위치 규칙 hard block"
```

---

## 정리 — 의존 관계 / 실행 권장 순서

1. **Task 1 → 2** 순차 (ModalForm 이 ModalShell 사용)
2. **Task 3** 우선 (ConfirmDialog 영향 12곳 — 먼저 안정화)
3. **Task 4a–g, 5a–b, 6, 7a–c** 는 서로 독립 → 병렬 가능. subagent 로 분산 권장 (subagent-driven-development).
4. **Task 8** 은 위 모든 마이그레이션 완료 후 (modal.tsx import 0건 확인 후)
5. **Task 9** 빌드/smoke test
6. **Task 10** 마이그레이션 PR 머지 후 별도 PR

## Out of Scope

- `useFormSubmit` 훅 채택 (Phase 2 작업) — 본 plan 에서는 saving/error state 만 ModalForm props 로 wiring
- `useResourceList` 채택 (Phase 2)
- Typography/Section/Layout 컴포넌트 (Phase 3)
- 대형 파일 분할 (Phase 4)
- 모달 안 폼의 시각적 변화 — Radix Dialog 기본 스타일 채택으로 인한 미세 차이는 허용 (사용자 노출 동작은 동일)
