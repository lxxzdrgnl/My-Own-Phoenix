# Evaluation Templates Rework Plan

**Goal:** Global Settings의 Evaluation Templates를 전용 UI로 만들고, 프로젝트 Evaluations에서 템플릿 import 기능을 정리한다.

---

## 현재 상태

- `EvalTemplatesSection`이 `EvaluationsManager globalMode`를 그대로 재사용 → 프로젝트용 UI(체크박스, backfill, test, Active Evaluations 헤더)가 그대로 노출됨
- API는 준비됨: GET(`includeGlobalTemplates`), POST(import), `seedProjectEvals` 존재
- 프로젝트 eval-editor에 `createMode` (custom/template) 탭 구현됨

## 문제점

1. Global Settings에서 `EvaluationsManager`를 재사용하면 프로젝트 전용 UI가 노출됨
2. Global Templates는 독립 UI가 필요 — 템플릿 CRUD만, 실행/체크박스 없음

---

## 설계

### Global Settings > Evaluation Templates

**구조:** 좌측 리스트 + 우측 에디터 (2-column)

**좌측 리스트:**
- 섹션 1: "Default Evaluations" — 새 프로젝트에 자동 복사되는 eval (현재 built-in 7개 + 사용자가 추가/제거 가능)
- 섹션 2: "Custom Templates" — 프로젝트에서 "From Templates"로 import할 수 있는 커스텀 eval
- 하단: "+ Add Template" 버튼
- 체크박스 없음, 클릭하면 우측 에디터에 표시

**우측 에디터:**
- eval-editor와 동일한 프롬프트/규칙 편집 UI
- Backfill, Test 패널 없음 (템플릿이므로 실행 불가)
- Save/Delete 버튼만

**데이터 모델:**
- 글로벌 eval: `EvalPrompt` where `projectId IS NULL`, `userId = uid`
- "Default Evaluations": `isCustom = false` (built-in) — 사용자가 on/off 선택 가능 → 새로운 테이블 또는 settings에 저장
- "Custom Templates": `isCustom = true`, `projectId IS NULL`

**프로젝트 생성 시:**
- `seedProjectEvals(projectId, userId)` — 해당 사용자의 글로벌 "Default Evaluations" 중 활성화된 것만 복사

### 프로젝트 Evaluations

**변경사항:**
- "Import from Templates" 버튼 (eval-list 하단): **삭제**
- "Add Evaluation" 클릭 → 우측 에디터 패널에 **먼저** "From Template" / "Custom" 선택 화면 표시
- "From Template" 선택 시: 글로벌 Custom Templates 목록 표시, 클릭하면 프로젝트로 복사
- "Custom" 선택 시: 기존 create 폼 (이름, 타입, 모델 선택)
- Scope 토글 (All Projects/default): 이미 제거됨

---

## 구현 Task

### Task 1: EvaluationsManager globalMode에서 불필요한 UI 숨기기

**파일:**
- 유지: `app/settings/eval-templates-section.tsx` — `<EvaluationsManager globalMode />` 그대로
- 수정: `app/evaluations/evaluations-manager.tsx` — `globalMode` prop 전달
- 수정: `app/evaluations/eval-list.tsx` — `globalMode`일 때:
  - 헤더: "Active Evaluations" → "Evaluation Templates"
  - 체크박스 숨김
  - "Import from Templates" 버튼 숨김 (이미 `onImportTemplates={undefined}`)
  - 섹션 구분: "Default Evaluations" / "Custom Templates"로 변경
- 수정: `app/evaluations/eval-editor.tsx` — `globalMode`일 때:
  - Backfill 패널 숨김
  - Test 패널 숨김
  - "From Template / Custom" 탭 숨김 (글로벌은 항상 Custom 생성)
  - Save는 projectId=null로 저장

### Task 2: Import from Templates 버튼 삭제 + import 모달 제거

**파일:**
- 수정: `app/evaluations/evaluations-manager.tsx` — `openImportModal`/`handleImport`/`importOpen`/`globalTemplates`/`selectedTemplates`/`importing` state 전부 제거, import 모달 JSX 제거
- 수정: `app/evaluations/eval-list.tsx` — `onImportTemplates` prop 제거, "Import from Templates" 버튼 제거

### Task 3: seedProjectEvals를 사용자 기본 eval 기반으로 변경

**파일:**
- 수정: `lib/eval-seed.ts` — `seedProjectEvals(projectId)` → 하드코딩된 BUILT_IN_EVALS 대신 DB에서 해당 사용자의 글로벌 active eval을 조회해서 복사

**변경:**
```typescript
// BEFORE: 하드코딩된 7개 복사
export async function seedProjectEvals(projectId: string) {
  for (const eval_ of BUILT_IN_EVALS) { ... }
}

// AFTER: 사용자의 글로벌 eval 중 isCustom=false인 것 복사
export async function seedProjectEvals(projectId: string, userId: string) {
  const globalEvals = await prisma.evalPrompt.findMany({
    where: { OR: [{ projectId: null }, { projectId: "" }], isCustom: false },
  });
  for (const eval_ of globalEvals) {
    // 프로젝트에 복사
  }
}
```

### Task 4: 프로젝트 eval create 폼 — "From Template / Custom" 선택 먼저

**파일:**
- 수정: `app/evaluations/eval-editor.tsx`

**동작:**
- `creating && !selectedEval` 상태 진입 시, 먼저 "From Template" / "Custom" 두 카드를 보여줌
- "From Template" 클릭 → 글로벌 Custom Templates 목록 표시, 클릭하면 프로젝트로 복사 후 `onCreated` 호출
- "Custom" 클릭 → 기존 create 폼 (이름, 타입, 모델 선택)
- 뒤로가기/취소 가능

**UI 흐름:**
```
[Add Evaluation 클릭]
   ↓
┌──────────────────────────────┐
│  New Evaluation              │
│                              │
│  ┌───────────┐ ┌───────────┐│
│  │   From    │ │  Custom   ││
│  │ Template  │ │           ││
│  │           │ │ Create a  ││
│  │ Import    │ │ new eval  ││
│  │ from      │ │ from      ││
│  │ global    │ │ scratch   ││
│  └───────────┘ └───────────┘│
│                              │
│  [Cancel]                    │
└──────────────────────────────┘
   ↓ "From Template"              ↓ "Custom"
┌────────────────────────────┐   ┌──────────────────┐
│ template_1  [LLM]          │   │ Name: __________ │
│   "Checks factual..."  [→]│   │ Type: LLM/Rule   │
│ template_2  [API]          │   │ Model: gpt-4o    │
│   "External eval..."   [→]│   │ [Create]         │
│                            │   │ [Cancel]         │
│ [← Back]                   │   └──────────────────┘
└────────────────────────────┘
   ↓ [→] 클릭 시 (상세 보기)
┌────────────────────────────┐
│ ← Back      template_1    │
│                            │
│ Type: LLM                  │
│ Badge: FACT                │
│                            │
│ PROMPT:                    │
│ ┌────────────────────────┐ │
│ │ You are an expert...   │ │
│ │ {context}              │ │
│ │ {response}             │ │
│ └────────────────────────┘ │
│                            │
│ [Import to Project]        │
└────────────────────────────┘
```

**상세 보기에서:**
- 템플릿 이름, 타입, badge, 프롬프트 내용을 읽기 전용으로 표시
- "Import to Project" 버튼 클릭 시 프로젝트로 복사 후 `onCreated` 호출

---

## 구현 순서

1. Task 1 (전용 UI) — `EvaluationsManager` 재사용 제거, 새 컴포넌트
2. Task 2 (globalMode 제거) — 정리
3. Task 3 (seed 로직) — DB 기반으로 변경
4. Task 4 (create 폼 정리) — 확인/미세 조정

## 위험도

- Task 1: 중 (새 UI, 기존 코드에 영향 없음)
- Task 2: 낮 (prop 제거)
- Task 3: 낮 (seed 함수 변경, 기존 프로젝트 영향 없음)
- Task 4: 낮 (이미 구현된 것 확인)
