# Traces 페이지 쿼리 검색 UI 재설계

**작성일:** 2026-05-23
**대상:** `app/projects/[name]/project-view.tsx` 의 traces 필터 영역
**작성자:** brainstorming 세션 결과

## 문제

현재 traces 페이지의 필터 UI는 세 가지 한계가 있다.

1. **검색 표현력 부족** — `searchQuery`는 query/response 본문 substring 검색만 가능. `annotationFilter`는 "전체/통과/실패/어노테이션 없음" 4개 버튼뿐이라 *어떤* 어노테이션 기준인지 표시되지 않음. 사용자가 "지금 어떤 어노테이션 통과를 보는지 모르겠다"고 명시적으로 지적함.
2. **다축 필터링 불가** — annotation + latency + status + cost + model 등을 조합하는 일반적인 디버깅 워크플로우가 안 됨.
3. **공유/재현 불가** — URL에 필터 상태가 안 담겨서 같은 뷰를 동료에게 공유할 수 없음.

## 목표

- GitHub/Linear 스타일 `key:value` 쿼리 언어 도입 (`hallucination:pass latency:>3s`).
- 기존 chip UI를 양방향 동기로 유지 (chip 클릭 → 쿼리바 자동 갱신 + 즉시 실행).
- 어노테이션별로 명시적 선택 (`hallucination:pass` 같이 어느 어노테이션인지 보임).
- URL state로 필터 공유/복원 가능.
- 쿼리는 클라이언트 사이드 평가 (Phoenix 서버 푸시다운은 별도 스펙).

## 비목표 (out of scope)

- Phoenix `filterCondition` GraphQL 푸시다운 — 추후 별도 스펙. 데이터 양이 많아질 때 검토.
- 복잡한 boolean 표현식 (괄호 그룹, `NOT` 키워드, 중첩 OR) — 단순 `-` 부정만.
- 저장된 필터 (saved filters / pins) — 추후.
- 다른 페이지 (datasets, evaluations 등) 적용 — 우선 traces만.

## 사용자 결정 사항 (브레인스토밍)

| 결정 | 선택 |
|---|---|
| 쿼리 문법 스타일 | GitHub 스타일 `key:value` + chip 양방향 동기 |
| 지원 필드 | annotation 이름들, latency, cost, tokens, status, feedback, model, name + 자유 텍스트 |
| 필터 실행 위치 | 클라이언트 사이드 (현재 trace 배열 위) |
| chip UX | 어노테이션별 dropdown + (전체/통과/실패/없음) + AND/OR 토글 |
| AND/OR 결합 | 같은 어노테이션 = 콤마 OR, 다른 어노테이션 = 토글 AND/OR, 다른 필드 = 항상 AND |
| 부정 | `-` 접두사 지원 |
| spec 위치/이름 | `docs/superpowers/specs/2026-05-23-traces-query-search-ui-design.md` |

## 레이아웃

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 🔍 [ hallucination:pass citation:fail latency:>3s    ]  [날짜▼]  [✕]    │
├──────────────────────────────────────────────────────────────────────────┤
│ 어노테이션  [hallucination▼] 전체 통과 실패 없음                          │
│             [citation▼] 전체 통과 실패 없음   [+ 추가]   [AND│OR]         │
│ 지연시간     전체  <1s  1-3s  >3s                                         │
│ 토큰 비용    전체  <$0.01  $0.01-0.1  >$0.1                              │
└──────────────────────────────────────────────────────────────────────────┘
```

- 쿼리바: 가로 풀-너비, 우측에 ✕ (전체 초기화), 날짜 픽커는 그대로.
- chip 행은 쿼리바 아래, 양방향 동기.
- chip 클릭 = 쿼리바 토큰 추가/교체 + **즉시 실행** (별도 검색 버튼 없음).
- `[+ 추가]` = 어노테이션 행을 인라인으로 하나 더 추가.

## 쿼리 문법

### 토큰 형식

`<field>:<value>` 공백 구분. 같은 필드가 여러 번이면 마지막이 이김 (chip 갱신 시 자연스러움).

| 필드 | 값 표현 | 예시 |
|---|---|---|
| 어노테이션 이름 (동적) | `pass` / `fail` / `none` / `pass,fail` | `hallucination:pass` `citation:pass,fail` |
| `latency` | `>3s` / `<1s` / `1s..3s` / `>3000` (ms 직접) | `latency:>3s` `latency:1s..3s` |
| `cost` | `>0.01` / `<0.1` / `0.01..0.1` (USD) | `cost:>0.01` |
| `tokens` | `>1000` / `<500` / `1000..5000` | `tokens:>1000` |
| `status` | `ok` / `error` | `status:error` |
| `feedback` | `up` / `down` / `none` | `feedback:down` |
| `model` | 문자열 (대소문자 무시) | `model:gpt-4o` |
| `name` | 문자열 substring | `name:chat` |
| `spanKind` | OpenInference span kind (대소문자 무시) | `spanKind:guardrail` `spanKind:tool` |
| (필드 없음) | query/response 전문 검색 | `"how do I"` |

### 결합 규칙

- 공백 = AND (기본).
- 같은 어노테이션의 여러 상태: 콤마 OR (`hallucination:pass,fail`).
- 다른 어노테이션 간: `[AND|OR]` 토글로 어노테이션 토큰들 사이만 결정.
  예: 토글 OR일 때 `hallucination:pass citation:fail latency:>3s` →
  `(hallucination:pass OR citation:fail) AND latency:>3s`.
- 다른 비-어노테이션 필드는 항상 AND.

### 부정

- `-` 접두사. 예: `-status:error` (에러 제외), `-hallucination:fail`.
- chip을 한 번 더 누르면 `-` 부착되는 cycle 동작도 가능 (구현 시 결정).

### 토큰 vs 자유 텍스트 구별 규칙 (위에서 아래로 평가)

1. `"..."` 따옴표로 감싼 부분 → 무조건 자유 텍스트 (콜론도 리터럴).
2. `<알려진 필드>:<값>` 패턴 → 구조화 토큰.
   - 알려진 필드 = 위 표의 정적 필드 + 프로젝트에 등록된 어노테이션 이름들.
3. `<모르는 단어>:<값>` 패턴 → 빨갛게 하이라이트 + 필터에서 제외 + 에러 메시지.
4. 콜론 없는 단어 → 자유 텍스트 (본문 검색).

### 자동완성

쿼리바 타이핑 시 드롭다운:
- 빈 상태: 필드 목록.
- `hal` 입력: `hallucination:` 제안.
- `hallucination:` 까지: 값 목록 (`pass`, `fail`, `none`).

## 아키텍처

```
사용자 입력 (쿼리바 또는 chip)
        ↓
   QueryParser            ← lib/query/parser.ts
        ↓
   AST: { tokens: Token[], annotationCombinator: "AND" | "OR" }
        ↓
   ┌────┴────┐
   ↓         ↓
URL state   FilterEngine  ← lib/query/filter.ts
   ↓         ↓
chip 상태   filtered traces
 동기화
```

### Token 타입

```ts
type Token =
  | { kind: "annotation", name: string, values: ("pass" | "fail" | "none")[], negate: boolean }
  | { kind: "numeric", field: "latency" | "cost" | "tokens", op: ">" | "<" | "between", value: number | [number, number], negate: boolean }
  | { kind: "enum", field: "status" | "feedback" | "spanKind", values: string[], negate: boolean }
  | { kind: "text", field: "model" | "name", value: string, negate: boolean }
  | { kind: "freetext", text: string };
```

### 모듈 분리

- `lib/query/parser.ts` — 텍스트 ↔ AST 양방향 변환. 수동 토큰화 (regex 없음).
- `lib/query/filter.ts` — `applyFilters(traces, ast) → traces[]` 순수 함수.
- `lib/query/fields.ts` — 필드 메타데이터 (자동완성, 라벨, 단위 변환).
- `components/query-bar/` — UI: 쿼리바, chip 행, 자동완성 드롭다운.

### chip ↔ 쿼리바 동기

- 단일 source of truth = AST (React state).
- chip 클릭 → AST 변경 → 쿼리바 텍스트 재생성 + chip 활성 상태 재계산.
- 쿼리바 편집 → 디바운스 200ms 후 파싱 → AST 갱신.
- 파싱 에러는 inline 표시, 필터는 유효한 토큰만 적용.

## 보안

| 표면 | 설계상 방어 |
|---|---|
| SQL 인젝션 | 해당 없음 — 클라이언트 사이드 JS 필터, DB로 안 흘러감. |
| XSS | React 기본 escape. `dangerouslySetInnerHTML` 사용 안 함. |
| ReDoS | regex 안 씀. 쿼리 최대 길이 1000자, 토큰 최대 50개. |
| Prototype pollution | AST는 `Map` 또는 `Object.create(null)`. 화이트리스트 필드만. |
| URL state | `URLSearchParams` 표준 인코딩. 파싱 시 동일 화이트리스트. |
| Cross-project leakage | 데이터 자체가 fetch 단계에서 프로젝트 격리됨. 필터는 그 안에서만 동작. |

Phoenix 서버 푸시다운 추가 시 별도 보안 검토 필요.

## 데이터 범위

```
[날짜 범위]  →  Phoenix에서 그 기간만 fetch
                         ↓
                  traces (날짜 + 프로젝트로 격리됨)
                         ↓
[쿼리 토큰]  →  그 안에서 다시 필터링
                         ↓
                  최종 표시
```

- 날짜 + 쿼리 = AND (둘 다 만족).
- 다른 프로젝트 데이터는 클라이언트에 존재하지 않음 → 쿼리로 새지 않음.
- 빈 결과는 기존 `EmptyState` 컴포넌트 + "필터 초기화" 버튼.

## 마이그레이션

- 기존 state 교체:
  - `searchQuery`, `annotationFilter`, `latencyFilter` (`project-view.tsx:103-105`) → 단일 `queryAST` state.
- 기존 필터 로직 (`project-view.tsx:133-151`) → `lib/query/filter.ts` 모듈로 이동.
- 컴포넌트는 AST와 callback만 다루도록 단순화.

## URL 상태

- `?q=hallucination%3Apass+latency%3A%3E3s` (URL-encoded).
- Next.js `useSearchParams` 사용.
- 새로고침 / 링크 공유 시 같은 필터 복원.
- 날짜 범위도 동일 패턴 (현재 URL 저장 여부 확인 후 통일).

## i18n

- 필드명/값 라벨/placeholder/에러 메시지 모두 `useT()` + `lib/i18n` 패턴.
- 한국어/영어 모두 분리 키.

## 테스트 전략

- `parser.test.ts` — 정상/에러/모서리 케이스 (URL, 따옴표, 부정, 콤마, 범위).
- `filter.test.ts` — 각 필드별 + AND/OR 조합 + 부정.
- `query-bar.test.tsx` — chip 클릭 → 쿼리바 갱신, 쿼리바 편집 → chip 갱신.
- TDD 권장 (`superpowers:test-driven-development` 스킬 적용).

## 후속 작업 (다른 스펙으로 분리)

- **#1 + 대시보드 협업 편집** — `DashboardLayout` 공유 + last-write-wins vs 잠금 vs CRDT.
- **#2 + #3 — 어노테이션 인프라** — 실시간 업데이트 (SSE/폴링) + AI vs Human 어노테이션 분리 비교 대시보드.
- **#5 — Trace tree에 Guard span 표시** — 에이전트 실행 과정의 guard 단계를 trace tree에서 시각화. 별도 spec (`2026-05-23-guard-span-tracing-design.md`) 참조. 핵심 발견: 현재 `dexter-phoenix-pii-guard` 에이전트는 GUARDRAIL span을 emit하지 않고 PII guard를 다른 span 안에서 부수효과로 실행함. 따라서 에이전트 측 + 대시보드 측 양쪽 변경 필요.
- Phoenix 서버 사이드 필터 푸시다운 — 데이터 양이 커진 후 검토.
