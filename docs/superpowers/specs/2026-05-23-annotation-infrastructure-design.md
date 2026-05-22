# Evaluations / Annotations 인프라: AI vs Human 분리 + 실시간 + Pending 표시

**작성일:** 2026-05-23
**상태:** ✅ 브레인스토밍 완료
**관련:**
- 기존: `lib/phoenix.ts` (annotatorKind 필드 이미 있음), `app/api/annotations/route.ts` (HUMAN 업로드 이미 있음)
- 이전 spec: `2026-04-22-human-annotation-design.md` (Human 입력 UI 구현 완료)
- 사이드카: `2026-05-23-traces-query-search-ui-design.md` (#4 검색 — 본 spec에 의해 검색 문법 확장됨)

## 문제

사용자가 명시한 다섯 가지 요구:

1. **#2 — 실시간 업데이트.** 어노테이션 eval 결과가 새로 생겨도 새로고침해야 보임.
2. **#3 — AI vs Human 분리 비교.** 같은 어노테이션을 AI/사람이 어떻게 다르게 평가했는지 비교 대시보드.
3. **#3' — 불일치 검색.** "hallucination에서 AI=fail/Human=pass" 같은 케이스를 쿼리로 찾고 싶음.
4. **#2' — 평가 예정 표시.** 켜져 있지만 아직 결과 없는 eval은 `-` 같은 placeholder.
5. **#3'' — Diff 케이스 → 데이터셋 수집.** 비교에서 발견한 불일치 trace 여러 건을 골라 데이터셋에 모음 (fine-tune / regression eval / ground truth).

**현실 제약:** 모든 trace를 사람이 라벨링하지 않음 (보통 10~30%). 따라서 `.human:*` 와 `.diff` 검색·비교는 Human 평가가 있는 부분집합 안에서만 의미 있음. UI에 모수 명시.

## 핵심 발견 (조사 결과)

기존 인프라가 생각보다 많이 갖춰져 있음:

| 항목 | 상태 |
|---|---|
| Phoenix `annotator_kind` 필드 | 이미 존재 (HUMAN / LLM) |
| `Annotation` 타입에 `annotatorKind` | 이미 있음 (`lib/phoenix.ts:25`) |
| HUMAN annotation 업로드 API | 이미 구현 (`app/api/annotations/route.ts`) |
| Feedback (👍/👎) → HUMAN annotation | 이미 변환됨 (`app/api/feedback/route.ts:74`) |
| Human annotation 입력 UI | 이미 구현 (`2026-04-22-human-annotation-design.md` spec) |
| Eval-worker LLM 평가 → LLM annotation | 이미 동작 (`app/api/eval-backfill/route.ts:192`) |

→ **빠진 것:** `annotatorKind`를 검색/필터/UI/비교 대시보드에서 활용하는 부분.

## 결정된 사항

### 1. 데이터 모델

기존 `Annotation` 타입 그대로 사용 (`annotatorKind` 이미 있음). 변경 없음.

```ts
type Annotation = {
  name: string;
  label: string;
  score: number;
  explanation?: string;
  annotatorKind?: "LLM" | "HUMAN";  // ← 이미 있음
};

// trace.annotations: flat array
trace.annotations = [
  { name: "hallucination", annotatorKind: "LLM",   label: "fail", score: 0.2 },
  { name: "hallucination", annotatorKind: "HUMAN", label: "pass", score: 1.0 },
  { name: "citation",      annotatorKind: "LLM",   label: "pass", score: 0.9 },
];
```

### 2. 검색 문법 (`#4` traces 검색 spec 확장)

| 쿼리 | 의미 |
|---|---|
| `hallucination:fail` | **AI**가 fail (접미사 없을 때 기본) |
| `hallucination.ai:fail` | 명시적 AI fail |
| `hallucination.human:fail` | Human이 fail |
| `hallucination.any:fail` | AI 또는 Human 중 하나라도 fail |
| `hallucination.diff` | AI ≠ Human (양 방향 모두) — 핵심 use case |
| `hallucination.diff:strict` | (선택, 구현 시 결정) 점수 차이 임계값 적용 |

**Diff 계산 규칙:**
- 같은 `name` + 같은 `spanId`에 LLM 평가와 HUMAN 평가가 둘 다 있을 때만 비교
- 비교 기준: `label` 우선. label이 같으면 점수 차 ≥ 0.5일 때 diff (초기값, 튜닝 여지)
- 한 쪽만 있으면 diff 아님 (비교 불가)

### 3. 평가 예정 (Pending) 표시

**구현 방식:** `ProjectEvalConfig.enabled = true` 인 eval 목록을 "기대 eval"로 간주.

```
각 trace에 대해:
  for evalName in ProjectEvalConfig.where({ enabled: true }):
    if annotations.has(name=evalName, kind=LLM):
      render(annotations[evalName].score)
    else:
      render("-")  // pending 또는 진행 중
```

- 새 테이블 / 큐 / EvalJob 모델 **불필요**
- "running" 상태는 별도로 추적하지 않음 (대부분 작업이 짧아서 사용자에게 큰 차이 없음)
- 툴팁: `-` 위에 마우스 올리면 "평가 대기 중 또는 진행 중"

### 4. 실시간 업데이트 — SSE + broadcast

**구조:**
```
eval-worker (eval 완료)
        ↓ POST /api/internal/eval-completed (webhook, 인증 토큰)
dashboard 서버
        ↓ SSE broadcast
모든 접속 클라이언트 (해당 프로젝트 화면 보고 있는)
        ↓ 자동 refetch (관련 trace만)
UI 갱신
```

**파일:**
- 새: `app/api/sse/project/[id]/route.ts` — Server-Sent Events 엔드포인트
- 새: `app/api/internal/eval-completed/route.ts` — eval-worker가 호출하는 webhook
- 새: `lib/sse-broadcast.ts` — 인메모리 broadcast 헬퍼 (프로젝트별 connections Map)
- 변경: `eval-worker/` — 작업 완료 시 webhook POST
- 변경: `project-view.tsx` — SSE 구독 훅 추가

**미니PC 단일 인스턴스 가정** — 인메모리 broadcast로 충분. 멀티 인스턴스 되면 Redis pub/sub 도입 (별도 spec).

**연결 관리:**
- 클라이언트는 페이지 마운트 시 SSE 구독, 언마운트 시 close
- 서버는 30초마다 keepalive ping
- 끊기면 클라이언트가 5초 후 재연결

**메시지 페이로드:**
```ts
type SseMessage = { type: "eval-completed", spanId: string, name: string, kind: "LLM" | "HUMAN" }
```

→ 클라이언트는 메시지 받으면 해당 spanId의 annotations만 refetch (전체 trace 리로드 X).

### 5. UI — Phoenix 용어 패턴 채택

**Trace detail 탭 구조** (Phoenix UI 패턴 참고하되 우리 페이지엔 필요한 것만):

```
[Input/Output] [Evaluations 🤖 (n)] [Annotations 👤 (m)]   [Raw ▼]
                       ↑                      ↑              ↑
                LLM eval 결과            Human 입력      OpenTelemetry
                (kind=LLM)              (kind=HUMAN)    attributes (접힘)
```

- Phoenix가 가진 `Prompts` / `Functions` / `Attributes` 탭은 **채택 안 함** — 현재 우리 페이지 흐름에 필요 없음 (`Prompts`는 별도 페이지에 이미 있고, `Functions`는 tool call span으로 충분, `Attributes` raw 데이터는 토글로)
- Evaluations 탭: 기존 자동 eval 결과 (LLM kind)
- Annotations 탭: 사람이 입력한 annotation (HUMAN kind) + 입력 폼 (`AnnotationForm`, 이미 있음)
- 카운트 배지: 각 탭에 개수 표시

**프로젝트 대시보드 비교 위젯** — 3종 탭으로 제공:

| 탭 | 표현 | 목적 |
|---|---|---|
| 불일치 목록 | trace_id + AI/Human 점수 나란히 + diff 사유 + **체크박스** | 개별 케이스 검토 / 다중 선택 |
| 혼동행렬 | 2×2 (AI pass/fail × Human pass/fail) | 전체 패턴 파악 |
| 산점도 | x=AI score, y=Human score, 대각선에서 거리 | 연속 점수 분포 |

각 탭 셀/점 클릭 → 해당 trace 디테일로 이동.

**모수 표시:** 위젯 상단에 항상 `"Human 평가 있는 N건 중 diff Y건 (XX%)"` — 사람 라벨링 커버리지 인지를 위해.

**빈 상태:** Human 평가 0건이면 "비교할 Human 평가가 없습니다. trace를 열어 [Annotations] 탭에서 평가를 추가하세요." + 링크.

**페이지 위치:** 새 URL `/[slug]/human-review/page.tsx`. 라벨 **"Human Review"**.

사이드바는 9개 항목 + 3 그룹 구조 (`components/project-sidebar.tsx`). 새 항목을 **MONITORING** 그룹 마지막에 추가:

```
TESTING:    Chat / Playground / Datasets
MONITORING: Dashboard / Requests / Evaluations / [Human Review 🆕]
SAFETY:     Measure / PII Guard
            (Risks는 별도 작업으로 삭제 예정)
```

- 페이지 본문: 비교 위젯 (탭 3종) 또는 빈 상태 안내 (아래 참고)

위젯은 새 컴포넌트 `components/dashboard/widgets/ai-human-comparison.tsx`로 분리하고, 새 페이지가 이걸 렌더.

**드롭다운 어노테이션 목록:** Human 평가가 1건이라도 있는 어노테이션 이름만 노출. 예 — 프로젝트에 7개 eval 켜져 있고 그중 hallucination/citation 2개만 Human 평가 받았다면 드롭다운에 그 2개만. 나머지 5개는 AI-only이므로 비교 대상 아님 (다른 페이지의 AI-only 위젯에선 그대로 보임).

### 7. Human Review 페이지 빈 상태 (온보딩)

Human 평가가 0건이면 위젯 대신 **온보딩 안내 페이지** 표시. 단순한 "데이터 없음" 메시지가 아니라 사용자가 시작할 수 있게 가이드:

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   👤  Human Review                                         │
│                                                            │
│   AI 자동 평가와 사람 평가를 비교해서 모델 정확도를           │
│   검증하고 학습 데이터를 모으는 페이지입니다.                  │
│                                                            │
│   현재 이 프로젝트에 Human 평가가 0건 있습니다.                │
│                                                            │
│   ── 시작하는 방법 ──                                       │
│                                                            │
│   1. Requests 페이지에서 trace 하나 열기                     │
│   2. [Annotations 👤] 탭 클릭                              │
│   3. eval 이름 선택, Pass/Fail 또는 점수 입력                 │
│   4. 저장 → 이 페이지에서 AI 평가와 비교 확인                 │
│                                                            │
│   [최근 trace 열기 →]   [샘플 예시 보기]                      │
│                                                            │
│   ── 한번 채워지면 이렇게 보입니다 ──                          │
│                                                            │
│   [흐릿한 mockup 이미지 또는 SVG]                             │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

- "최근 trace 열기" → 가장 최근 trace 디테일 페이지 직접 이동
- "샘플 예시 보기" → 토글하면 위젯 mockup (가상 데이터로) 보여줌
- 한 건이라도 들어오면 자동으로 위젯 모드로 전환

### 8. Diff 케이스 → 데이터셋 수집 (핵심 워크플로우)

**용도:** 비교에서 찾은 불일치 trace를 골라 데이터셋으로 모음 → 평가 모델 fine-tune, regression eval, eval prompt 개선의 ground truth.

**흐름:**
```
[불일치 목록 탭]
  ☐ trace_123  AI:fail(0.2)  Human:pass(1.0)
  ☑ trace_456  AI:pass(0.9)  Human:fail(0.0)
  ☑ trace_789  AI:fail(0.3)  Human:pass(0.9)
   ...
  [3건 선택됨] [데이터셋에 추가 ▼]
                    ↓
            ┌──────────────────────┐
            │ 기존 데이터셋 추가     │
            │  ▸ regression-eval-v2 │
            │  ▸ hallucination-gt   │
            │ ─────────────────     │
            │ 새 데이터셋 만들기...   │
            └──────────────────────┘
                    ↓
              저장 → 토스트 "3건 추가됨"
```

**DatasetRow 매핑** (기존 `Dataset` + `DatasetRow` 모델 재활용):

```ts
DatasetRow.data = JSON.stringify({
  query:        trace.query,
  response:     trace.response,
  expected:     human.label,           // 사람 정답
  ai_predicted: ai.label,              // AI가 예측한 라벨 (참고용)
  ai_score:     ai.score,
  human_score:  human.score,
  eval_name:    "hallucination",       // 어떤 eval에서의 불일치인지
  source_trace_id: trace.id,           // 추적성
});
```

**Dataset 메타데이터:** 새로 만들 때 자동 제안 이름 `{eval_name}-diff-{YYYYMMDD}` (예: `hallucination-diff-20260523`).

**구현:**
- 새 API: `POST /api/datasets/:id/rows-from-traces` — body: `{ traceIds: string[], evalName: string }`
- 새 컴포넌트: `components/dashboard/widgets/add-to-dataset-dialog.tsx`
- 비교 위젯에 체크박스 + 액션 바 추가

**비목표:** 자동/스케줄 수집 (지금은 사람이 명시적으로 추가만). 추후 spec.

### 6. 용어 / 코드 영향

- **내부 코드**: `Annotation` 타입 유지 (rename X). `annotatorKind` 필드로 구분.
- **UI 라벨**: Phoenix 패턴
  - HUMAN kind → "Annotation"
  - LLM kind → "Evaluation"
- **i18n** 키 추가:
  - `evaluations`: "평가" / "Evaluations"
  - `annotations`: "어노테이션" / "Annotations"

기존 코드에서 "annotation"이라는 단어가 LLM eval에 혼용되어 있는 곳은 그대로 두되, 새로 만드는 UI 라벨은 Phoenix 패턴 따름.

## 비목표 (out of scope)

- 멀티 인스턴스 SSE (Redis pub/sub 등) — 인메모리만
- Running 상태 별도 추적 — pending과 합쳐서 `-` 한 가지로 표시
- Eval 이름 매핑 (AI 이름 ≠ Human 이름) — 같은 이름일 때만 비교
- inter-annotator agreement (Cohen's kappa 등 통계 지표) — 추후
- 여러 Human annotator 간 비교 (현재는 AI ↔ Human 1:1만) — 추후
- "어노테이션 DB 분리" (별도 테이블) — 사용자가 제안했지만, 조사 결과 Phoenix가 이미 source of truth고 우리는 거기서 fetch만 함. 분리 불필요.

## 영향받는 파일 (추정)

| 파일 / 모듈 | 변경 내용 |
|---|---|
| `lib/phoenix.ts` | 변경 없음 (annotatorKind 이미 있음) |
| `lib/query/parser.ts` (#4 spec) | `.ai` / `.human` / `.any` / `.diff` 접미사 파싱 |
| `lib/query/filter.ts` (#4 spec) | annotator_kind 필터링 + diff 계산 |
| `lib/rmf-utils.ts` | annotator_kind 분리 옵션 (위젯 계산에서 AI만 / Human만 / 둘 다) |
| `app/projects/[name]/project-view.tsx` | SSE 구독 훅, pending placeholder 렌더, 새 비교 탭 |
| `app/projects/[name]/traces/[traceId]/trace-detail-view.tsx` | Evaluations / Annotations 탭 분리 |
| 새: `components/dashboard/widgets/ai-human-comparison.tsx` | 3종 비교 탭 위젯 |
| 새: `app/api/sse/project/[id]/route.ts` | SSE 엔드포인트 |
| 새: `app/api/internal/eval-completed/route.ts` | eval-worker webhook |
| 새: `lib/sse-broadcast.ts` | 인메모리 broadcast |
| `eval-worker/` | 작업 완료 시 webhook POST |
| 새: `app/api/datasets/[id]/rows-from-traces/route.ts` | diff trace → DatasetRow |
| 새: `components/dashboard/widgets/add-to-dataset-dialog.tsx` | 데이터셋 선택 modal |
| `lib/i18n/{ko,en}.ts` | 새 라벨 키 |

## 테스트 전략

- `lib/query/filter.test.ts` — `.diff` 계산: 같은 span+name에 LLM, HUMAN 둘 다 있을 때 / 한 쪽만 있을 때 / label과 score 모두 일치할 때
- `lib/query/parser.test.ts` — 접미사 파싱
- `lib/sse-broadcast.test.ts` — connection add/remove, broadcast 정확성, keepalive
- `ai-human-comparison.test.tsx` — 혼동행렬 카운트 정확성
- 통합: eval-worker → webhook → SSE → 클라이언트 갱신까지 한 흐름 (수동 테스트 OK)

## 마이그레이션

- 데이터 모델 변경 없음 → DB 마이그레이션 불필요
- 기존 사용자에게 점진적 노출:
  - 신규 위젯: 추가하면 새로 보임 (강제 노출 안 함)
  - SSE: 점진적 rollout 불필요 (인프라가 단순함)
  - 검색 접미사: 후방 호환 (접미사 없으면 기존 동작 = AI)

## 후속 작업 (다른 spec)

- 인터-annotator agreement 통계
- 여러 Human annotator 비교
- AI/Human eval 이름 매핑 테이블
- 멀티 인스턴스 SSE (Redis)
