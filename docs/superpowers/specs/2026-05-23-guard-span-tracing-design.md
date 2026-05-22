# Trace tree에 Guard span 표시 (에이전트 + 대시보드)

**작성일:** 2026-05-23
**상태:** ✅ 브레인스토밍 완료
**관련:**
- 에이전트 레포: `/home/rheon/Desktop/Projects/dexter-phoenix-pii-guard/`
- 대시보드: `components/span-tree-view.tsx`, `lib/phoenix.ts`, `app/projects/[name]/traces/[traceId]/trace-detail-view.tsx`
- 사이드카 spec: `2026-05-23-traces-query-search-ui-design.md` (이미 `spanKind:guardrail` 검색 지원)

## 문제

사용자 의도: 요청 흐름 `guard → search → response` 중 trace tree에 guard 단계가 보여야 함. 예시 — "영업3팀 장그래 사원의 연봉을 알려줘" → 에이전트가 "공개되어 있지 않으며..." 거부 → 이 거부가 어느 단계에서 일어났는지 trace tree에서 즉시 파악 가능해야 함.

## 발견 사항 (사전 조사)

### 1. 에이전트는 GUARDRAIL span을 emit하지 않음

`dexter-phoenix-pii-guard/` 전체 grep 결과 emit하는 span kind:

| Span Kind | 위치 |
|---|---|
| `AGENT` | `src/agent/agent.ts:139` (루트) |
| `CHAIN` | `src/agent/agent.ts:185`, `scripts/run-pii-evals.ts:185` |
| `LLM` | `src/agent/agent.ts:197` |
| `TOOL` | `src/agent/tool-executor.ts:184` |

**GUARDRAIL: 0건.** PII guard 로직 (`src/observability/guards/`)은 `sanitizeForStorage`, `sanitizeValueForStorage`, `runGuard` 같은 함수로 호출되지만 OpenTelemetry span으로 감싸지지 않고 다른 span 안에서 부수효과로 실행됨.

### 2. Phoenix는 모든 span을 수집

`lib/phoenix.ts:189` `fetchSpansAndAnnotations`가 spanKind 필터 없이 모든 span을 가져옴. 즉 에이전트가 emit만 시작하면 자동으로 우리 대시보드에 들어옴.

### 3. 대시보드는 GUARDRAIL kind를 인지 못 함

- `components/span-tree-view.tsx:75-82` `SPAN_BAR_COLORS`에 LLM/CHAIN/RETRIEVER/TOOL/AGENT/PROMPT 만 등록. GUARDRAIL 없음 → fallback 회색
- `lib/phoenix.ts:307-308` 컨텍스트 추출에서 TOOL/RETRIEVER만 봄 → guard 출력 무시
- 검색/필터에 spanKind 노출 없음 (#4 traces 검색 spec에서 `spanKind:guardrail` 쿼리로 해결됨)

### 4. 기존 DB 검증 완료 (2026-05-23 SSH 확인)

미니PC `phoenix_traces` DB의 `spans` 테이블:
```
 span_kind | count
-----------+-------
 LLM       |   602
 CHAIN     |   476
 TOOL      |   216
 AGENT     |   128
 UNKNOWN   |    50
 PROMPT    |    50
 RETRIEVER |    27
```
→ **GUARDRAIL 0건 확정.** 에이전트 측 변경이 필수 전제. 새로 발생하는 trace부터 점진적으로 노출됨.

`UNKNOWN` (50건) 은 span_kind attribute가 안 설정된 케이스로 추정 — 별도 조사 항목 (현 spec 범위 밖).

## 결정된 사항 (브레인스토밍에서 확정)

| 결정 | 내용 |
|---|---|
| 에이전트 측 범위 | **모든 PII guard 호출**을 GUARDRAIL span으로 감싸기 (PII 안 나온 검사도 `triggered: false`로 기록) |
| Span 구조 | **Guard 호출당 span 1개** — child span 안 만듦. attributes에 `detections[]` 배열로 PII 목록 |
| 시각 스타일 | **빨강** (triggered: PII 마스킹 발생) / **회색** (triggered: false, 검사만 통과) + Shield 아이콘 |
| Trace 레벨 표시 | Requests 목록에 **🛡 배지** — triggered=true span이 trace에 1건이라도 있으면 |
| Span 상세 | **Side-by-side diff** — 좌측 원본 입력, 우측 마스킹된 출력. 변경된 부분 하이라이트 + detection 타입 배지 |
| 작업 순서 | (1) 에이전트 측 emit 먼저, (2) 대시보드 측 시각화/배지 나중 |

## 비목표 (out of scope)

- LLM 응답 거부(정책 위반 응답) 케이스를 별도 GUARDRAIL span으로 감싸기 — 현재 PII guard 외 거부 로직이 명시적으로 없음. 필요해지면 별도 작업
- Guard 외 다른 보안 단계 (input validation, rate limit 등) 의 span 처리
- Guard 결과 통계 대시보드 (얼마나 자주 트리거되는지) — 추후 spec
- 마이그레이션 (기존 trace를 retrofit) — 새로 발생하는 trace부터만 적용

## 에이전트 측 (`/home/rheon/Desktop/Projects/dexter-phoenix-pii-guard`)

### 변경 범위

`src/observability/guards/` 의 진입 함수들을 OpenTelemetry tracer로 감쌈:

| 함수 | 파일 | Wrap 방식 |
|---|---|---|
| `runGuard()` | `src/observability/guards/runGuard.ts` (또는 유사) | 함수 본문을 `tracer.startActiveSpan` 으로 감쌈 |
| `sanitizeForStorage()` | `src/observability/guards/piiGuard.ts` | 동일 |
| `sanitizeValueForStorage()` | 동일 | 동일 |

### Span 정의

```ts
const tracer = trace.getTracer("pii-guard");

return tracer.startActiveSpan("pii_guard", {
  attributes: {
    [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.GUARDRAIL,
    "guardrail.type": "pii_mask",                       // 종류
    "input.value": originalText,                        // 원본
  },
}, async (span) => {
  try {
    const result = await runGuardLogic(originalText);
    span.setAttributes({
      "output.value": result.maskedText,                // 마스킹 후
      "guardrail.triggered": result.detections.length > 0,
      "guardrail.detections": JSON.stringify(
        result.detections.map(d => ({
          type: d.type,       // phone | rrn | email | ...
          start: d.start,
          end: d.end,
          masked: d.maskedValue,
        }))
      ),
      "guardrail.detection_count": result.detections.length,
    });
    return result;
  } catch (e) {
    span.recordException(e);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw e;
  } finally {
    span.end();
  }
});
```

### OpenInference 표준 활용

- `OpenInferenceSpanKind.GUARDRAIL` — 표준에 있으면 사용. 없으면 문자열 "GUARDRAIL"로 fallback
- `guardrail.*` attribute는 우리가 정의 (OpenInference에 아직 표준 없음. 추후 표준 나오면 마이그레이션)
- `input.value`, `output.value` 는 OpenInference 표준 attribute

### 테스트

- `pii-guard.span.test.ts` — guard 호출 시 span 생성 확인, attributes 정확성, triggered 분기
- 통합: 에이전트 한 사이클 돌려서 Phoenix에 GUARDRAIL span 도착 확인

## 대시보드 측 (`My-Own-Phoenix`)

### 1. Span 색깔/아이콘 (`components/span-tree-view.tsx`)

```ts
const SPAN_BAR_COLORS: Record<string, string> = {
  LLM: "#a5d6a7",
  CHAIN: "#a3b8f0",
  RETRIEVER: "#e091ab",
  TOOL: "#e0a86b",
  AGENT: "#b0b0b0",
  PROMPT: "#c4a0d8",
  GUARDRAIL: "#dc2626",          // triggered (기본)
  GUARDRAIL_PASS: "#9ca3af",     // triggered=false (회색)
};
```

색 분기는 `getSpanStyle()` 안에서 `attributes["guardrail.triggered"]` 확인 후 선택.

아이콘: lucide `Shield` (triggered) / `ShieldCheck` (통과). `SpanTimeline` 좌측에 표시.

### 2. Span 상세 view

새 컴포넌트 `components/span-detail/guardrail-detail.tsx`:

```
┌──────────────────────────────────────────────────────────────────┐
│ 🛡 PII Guard                       triggered  •  2 detections    │
├──────────────────────────────────────────────────────────────────┤
│ 원본 입력                       │  마스킹된 출력                    │
│ ───────────────────────────────┼───────────────────────────────  │
│ 영업3팀 장그래 사원의 연봉을      │ 영업3팀 [NAME] 사원의 연봉을       │
│ 알려줘. 연락처는 010-1234-5678   │ 알려줘. 연락처는 [PHONE]          │
│      ^^^^^^^                    │       ^^^^^^^^                  │
│      [phone]                    │                                 │
└──────────────────────────────────────────────────────────────────┘
```

- 좌우 split (변경되지 않은 부분은 양쪽 동일, 변경된 부분 하이라이트)
- 하단에 detections 배열 펼친 표: `type / start-end / masked`
- 통과 케이스 (triggered=false): 좌측만 표시 + "No PII detected" 메시지

### 3. Trace 레벨 배지 (Requests 목록)

`project-view.tsx`의 trace row 렌더링에 추가:

```tsx
{trace.hasGuardrailTriggered && (
  <Badge variant="destructive" className="text-[10px]">
    🛡 guard
  </Badge>
)}
```

판정 로직: trace의 모든 span을 순회해서 `spanKind === "GUARDRAIL" && attributes["guardrail.triggered"] === true` 있으면 true. `lib/phoenix.ts`의 `fetchTraces` 결과를 만들 때 같이 계산해서 `Trace` 타입에 `hasGuardrailTriggered: boolean` 추가.

### 4. 컨텍스트 추출에 guard 출력 포함 (`lib/phoenix.ts`)

현재 `lib/phoenix.ts:307-308` 의 컨텍스트 추출:
```ts
if (kind === "TOOL" || kind === "RETRIEVER") { ... }
```

→ GUARDRAIL은 단독 분기 추가하거나, 컨텍스트엔 안 넣어도 됨 (guard는 RAG 컨텍스트가 아님). 현 단계에서는 변경 없이, span 상세에서만 별도 표시.

### 5. 검색 통합 (`#4 spec`에서 이미 완료)

`spanKind:guardrail` 쿼리 → triggered/통과 모두 표시.

추가 쇼트컷 (선택, 구현 시 결정):
- `guardrail:triggered` → triggered=true 인 것만
- `guardrail:pass` → triggered=false 인 것만

## 영향받는 파일

### 에이전트 레포 (`dexter-phoenix-pii-guard`)

| 파일 | 변경 |
|---|---|
| `src/observability/guards/runGuard.ts` (또는 main entry) | tracer.startActiveSpan wrap |
| `src/observability/guards/piiGuard.ts` | sanitize 함수들 wrap |
| `package.json` | OpenInference SDK 버전 확인 (GUARDRAIL kind 지원) |
| 새: `src/observability/guards/pii-guard.span.test.ts` | span 생성 테스트 |

### 대시보드 레포 (`My-Own-Phoenix`)

| 파일 | 변경 |
|---|---|
| `components/span-tree-view.tsx` | `SPAN_BAR_COLORS`에 GUARDRAIL 추가, `getSpanStyle` 분기, Shield 아이콘 |
| `lib/phoenix.ts` | `Trace` 타입에 `hasGuardrailTriggered`, 계산 로직 |
| 새: `components/span-detail/guardrail-detail.tsx` | side-by-side diff 컴포넌트 |
| `app/projects/[name]/traces/[traceId]/trace-detail-view.tsx` | GUARDRAIL span 케이스 분기, 새 컴포넌트 렌더 |
| `app/projects/[name]/project-view.tsx` | trace row에 guard 배지 |
| `lib/i18n/{ko,en}.ts` | 새 라벨 (Guard / triggered / detections / 마스킹 등) |

## 테스트 전략

- `span-tree-view.test.tsx` — GUARDRAIL span이 빨강/회색으로 렌더되는지
- `guardrail-detail.test.tsx` — diff 정확성, detections 배열 렌더링
- `phoenix-trace.test.ts` — `hasGuardrailTriggered` 계산
- 통합 (수동): 에이전트 한 사이클 → Phoenix 도착 → trace tree에 GUARDRAIL span 보임 → 클릭 → diff 표시

## 마이그레이션 / 호환성

- 에이전트 측: 변경 후 새로 발생하는 trace부터 GUARDRAIL span 발생. 기존 trace는 영향 없음.
- 대시보드 측: 변경 후 GUARDRAIL span이 없는 trace는 기존처럼 보임 (배지 X, 상세 X). 점진적 노출.
- DB 마이그레이션 불필요 (Phoenix가 알아서 새 span_kind 받음).

## 후속 작업 (다른 spec)

- Guard 결과 통계 대시보드 (얼마나 자주 어떤 PII가 마스킹되는지)
- LLM 응답 거부(정책 위반) 케이스 GUARDRAIL span 처리
- OpenInference 표준에 guard attribute 정식 채택되면 마이그레이션
- Prompt injection / jailbreak 탐지 결과도 GUARDRAIL kind로 통합

## 기존 데이터 확인 (완료)

2026-05-23 SSH 확인 — **GUARDRAIL 0건** 확정. 에이전트 측 emit 먼저 필수.
