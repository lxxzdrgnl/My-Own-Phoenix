# 문서 페이지 확장 — 설계 (Spec)

작성일: 2026-05-30
대상: `app/docs/` 문서 페이지 + `lib/i18n/{ko,en}.ts`

## 목표

`/docs` 문서 페이지에 최근 세션에서 추가/변경된 기능을 반영한다.

1. **트레이싱 연동** 섹션 신설 — 에이전트 내부에서 **코드로 span을 나누는 수동 계측**을 설명 (사용자 핵심 질문: "span 알아서 추적되나?" → 답: 자동 계측은 LLM SDK 호출뿐, 에이전트 단계 span은 코드로 작성).
2. **사람 평가** 섹션 신설 — 목적은 **eval 프롬프트 개선**(LLM 판정을 사람 판정으로 검증→프롬프트 교정).
3. **금융 AI RMF 보고서** 섹션 신설 — 인터랙티브 목업 + **mock 보고서 PDF 다운로드**.
4. **기존 트레이싱 섹션 뷰 목업 갱신** — 실제 UI 변경 반영(Canvas 그래프, Lucide 아이콘, GUARDRAIL span kind, IO/Evals/Raw 3탭, 타임라인 바).
5. 그 외 세션 변경 감사 반영(금융 RMF eval 6종, AI 출력 언어 설정).

## 현재 구조 (재사용 대상)

- `app/docs/page.tsx` — 사이드바 2그룹(`시작하기`/`기능`) + `SECTION_COMPONENTS` 매핑 + `GROUPS` 배열.
- `app/docs/sections/*.tsx` — 섹션별 컴포넌트. 공통 패턴: **인터랙티브 목업 → 설명 → 표/코드 → `Callout`**.
- `app/docs/code-block.tsx` — `CodeBlock` / `Callout` / `DocTable` 공유 컴포넌트.
- `lib/i18n/{ko,en}.ts` — `docs` 객체 안에 섹션별 번역 키.
- 색상 규칙: 모노톤 + `#10b981`/`#ef4444`만. 문자열은 전부 i18n(하드코딩 경고 훅 존재).

## 신규 사이드바 항목 (모두 "기능" 그룹)

`page.tsx`의 features 그룹 항목 순서:
`tracing` → **`tracing-setup`(트레이싱 연동)** → `evaluations` → **`human-review`(사람 평가)** → `dashboard` → **`rmf-report`(RMF 보고서)** → `datasets` → `chat` → `playground`

---

### 섹션 1: 트레이싱 연동 (`app/docs/sections/tracing-setup.tsx`)

**핵심 메시지**: "span은 자동으로 다 잡히지 않는다. 에이전트의 각 단계(계획·추론·툴·가드)는 **코드에서 span으로 직접 나눈다**. 자동 계측되는 건 LLM SDK 호출 정도다."

콘텐츠 (위→아래):

1. **2줄 연동** (`CodeBlock`) — 트레이스 전송 설정 (api-keys 섹션과 일관):
   ```
   PHOENIX_COLLECTOR_ENDPOINT=https://phoenix.rheon.kr/api/collect
   PHOENIX_API_KEY=pt_your_trace_key   # pt_ 키가 수신 프로젝트를 결정
   ```
2. **자동 vs 수동 비교 카드** (2열 그리드, evaluations 섹션의 llmVsRule 그리드 패턴 재사용):
   - **자동 계측**: instrumentor 한 줄(`new OpenAIInstrumentation()`) → LLM SDK 호출 span 자동 생성. 에이전트 흐름/툴/가드는 안 잡힘.
   - **수동 span**: 에이전트 코드에서 `tracer.startSpan(name, { SPAN_KIND }, parentCtx)`로 단계를 직접 span으로 분할.
3. **수동 span 계측 예시** — **언어 탭 토글(TypeScript ↔ Python)**로 전환해 같은 패턴을 두 언어로 제공:
   - tracer 획득(`OITracer`), `Agent.run`(AGENT) span 시작 → 부모 context 설정
   - 반복마다 `planning`/`reflection`(CHAIN) + `llm.chat`(LLM) span을 부모 context에 중첩
   - `tool.<name>`(TOOL) span, PII `GUARDRAIL` span
   - `setAttribute`로 입력/출력/토큰 기록, `span.end()`
   - **TypeScript**: dexter-phoenix-pii-guard 실제 패턴 기반(`src/observability/telemetry.ts`, `src/agent/agent.ts`, `tool-executor.ts`, `guards/piiGuard.ts`) 단순화 인용 — `tracer.startSpan(name, { [SemanticConventions.OPENINFERENCE_SPAN_KIND]: ... }, parentCtx)`.
   - **Python**: 동등 패턴 — `from openinference.semconv.trace import OpenInferenceSpanKindValues`, `with tracer.start_as_current_span(name, attributes={...}) as span:` 중첩 + `span.set_attribute(...)`.
   - 탭 토글 구현: 섹션 로컬 `useState`로 `"ts" | "py"` 전환 후 해당 `CodeBlock` 렌더(기존 evaluations 섹션의 form/raw 토글 패턴 재사용). 텍스트 라벨은 i18n, 코드 본문은 리터럴.
4. **span kind 표** (`DocTable`) — AGENT/CHAIN/LLM/TOOL/RETRIEVER/GUARDRAIL + 용도 + OpenInference semantic convention 키(`OPENINFERENCE_SPAN_KIND`).
5. **부모-자식 트리** 설명 — `startSpan`의 3번째 인자(parent context)로 트리 계층 구성, context 스택(push/pop).
6. **검증 체크리스트** (`Callout`) — 트레이스가 안 보일 때: 엔드포인트/`pt_` 키/프로젝트명/instrumentor 등록/네트워크.

기존 `tracing`(개념·트리·캡처 데이터)과 **연동·코드 계측**으로 역할 분리, 상호 링크.

---

### 섹션 2: 사람 평가 (`app/docs/sections/human-review.tsx`)

**핵심 메시지(목적)**: 사람 평가는 **eval(LLM 판정) 프롬프트를 개선**하기 위한 것. AI 판정과 사람 판정을 나란히 비교 → 불일치(혼동행렬 off-diagonal, 산점도 대각선 이탈)를 보고 → eval 프롬프트/기준을 교정.

목업 (실제 `human-review-view` + `ai-human-comparison` 재현):

1. **KPI 4카드**: 커버리지(사람평가 트레이스/전체), 비교가능 쌍, 불일치 수, 일치율.
2. **어노테이션 필터 pill** (eval별 카운트) — 활성 pill 모노톤 반전.
3. **혼동행렬 2×2** (행=Human, 열=AI; 대각선=일치, off-diagonal=불일치 강조) + **산점도** (x=AI score, y=Human score, 대각선 기준선, 불일치 점은 채운 원).
4. **불일치 트레이스 목록** (간략 카드).

설명 단락:
- **왜 필요한가**: LLM-as-judge도 틀린다 → 사람 라벨이 ground truth → 불일치 패턴이 프롬프트 약점을 드러냄.
- **어디서/어떻게 하나** (강조): 사람 평가는 **트레이싱 뷰에서** 한다. 트레이스 상세 → span의 **Evals 탭** → 각 eval 행의 HUMAN 컬럼에서 Pass/Fail 토글 또는 Score(%) 입력(+설명). 입력 즉시 AI↔Human 비교가 갱신됨. (사람 평가 페이지는 그 결과를 집계·비교해 보여주는 뷰) — 실제 위치를 짚어주는 작은 안내(트레이싱 뷰 Evals 탭 mini-mock 또는 단계 설명).
- **개선 루프**: 불일치 사례 확인 → eval 프롬프트(Role/Task/기준) 수정 → 재평가.

`Callout`: 비교에는 같은 eval에 대해 AI·HUMAN 어노테이션이 모두 있어야 한다.

---

### 섹션 3: 금융 AI RMF 보고서 (`app/docs/sections/rmf-report.tsx`)

**핵심 메시지**: 트레이스·eval·사람평가를 금융감독원 AI RMF 프레임워크(4부문 16항목)로 집계해 위험등급을 산정하고, 감독 대응용 A4 보고서를 발급. **로컬 전용 기능**.

목업 — 실제 `RmfReportView`의 2-mode(대시보드/미리보기) 탭 토글 재현:

- **대시보드 탭**:
  - 등급 게이지 히어로(저/중/고/초고, 밴드 0–24/25–49/50–74/75–100)
  - KPI 4카드: 등급 · 잔여위험 총점(/100) · 분석 트레이스 · 지적 수
  - 부문별 위험도 막대: 합법성(20) · 신뢰성(30) · 신의성실(20) · 보안성(30)
  - 문제 트레이스 카드(지적 많은 순)
- **보고서 미리보기 탭** (A4 sheet, `RmfBody` 시각 스타일):
  - 표지(대상 서비스 · 기간 · 분석 트레이스 · 고위험 여부 · 평가자 · 생성일)
  - 종합등급 밴드
  - 위험평가 요약표(인식 − 경감 = 잔여, 부문 소계, 총점→등급)
  - 지적사항(eval 배지, HUMAN 배지, 근거 질의)

설명 단락: 4부문/등급밴드, eval→위험 prefill 매핑, AI 종합 피드백(LLM), 버전 저장, 출력 옵션.

**mock PDF 다운로드** (사용자 요청):
- "보고서 PDF로 저장" 버튼 → mock A4 보고서를 **브라우저 인쇄→PDF**로 발급.
- 구현: 실제 앱과 동일하게 **scoped print CSS**(`@media print`로 보고서 sheet만 남기고 docs UI 숨김)를 주입하고 `window.print()` 호출. 별도 바이너리 자산 없이 실제 제품 동작과 일치(최근 "화면=인쇄 페이지 경계 일치" 작업과 동일 방식).
- print 컨테이너는 RMF의 A4 폭/페이지 분할 스타일을 따른다.

`Callout`: 로컬 전용·금융 도메인 특화 기능, 감독당국 제출용 양식.

---

### 섹션 4: 기존 트레이싱 섹션 목업 갱신 (`app/docs/sections/phoenix-tracing.tsx`)

실제 뷰 변경 반영:

- **그래프**: 색상을 실제 Canvas 값과 일치(AGENT `#171717`, LLM `#059669`, CHAIN `#2563eb`, RETRIEVER `#db2777`, TOOL `#d97706`). (Canvas 전체 재구현은 과함 → 기존 SVG 근사 유지하되 색/노드 스타일·pan/zoom "있음" 캡션으로 정합)
- **GUARDRAIL span kind 추가** (Shield, triggered=빨강/`#ef4444` 계열, pass=회색) — 트리·그래프 mock에 가드 span 1개 추가.
- **아이콘**: 글자 배지(A/C/L/T) → 실제는 Lucide 아이콘(Bot/Link2/Search/Box/Shield)임을 반영(목업은 글자 유지 가능, 단 GUARDRAIL은 shield 표시).
- **탭**: Input/Output → **IO / Evals / Raw 3탭**. Evals 탭 mock(이름·AI 배지·AI 설명·Human Pass/Fail·Human 설명 + Run All).
- **타임라인 바**: 자식 span latency 비율 막대 추가.

---

## B. 기존 섹션 텍스트 갱신 (세션 감사)

- **`evaluations`**: **AI 출력 언어 설정**(평가 설명·RMF 피드백 생성 언어, 앱 UI 언어와 독립)을 **프로젝트 설정에서 지정**한다는 안내 한 단락/Callout 추가. (금융 RMF eval 6종은 굳이 추가하지 않음 — 사용자 결정.)
- **`tracing`**: 새 `트레이싱 연동` 섹션으로 상호 링크.
- **`dashboard`**: NIST/RMF 단락에서 RMF 보고서 섹션으로 링크.

## C-0. CodeBlock TypeScript 하이라이터

`app/docs/code-block.tsx`의 `highlight()`는 현재 Python(`.py`)·bash(`terminal`/`.sh`)만 지원하고 그 외 파일명은 원문 평문 반환. 트레이싱 연동 섹션의 TS 탭이 색칠되도록:
- `TS_KW`(const/let/var/function/return/import/from/export/new/class/interface/type/async/await/if/else/for/while/try/catch/finally/throw/extends/implements 등) + `TS_CONST`(true/false/null/undefined/this) 추가.
- `hlPython` 구조를 따르는 `hlTs(line)` 추가(`//` 주석, `/* */`은 단순화 가능, 문자열 `' " \``, 키워드/상수 색).
- `highlight()`에 `isTs = filename?.endsWith(".ts") || .tsx` 분기 추가 → `hlTs` 사용.
- 색상은 기존 `C` 팔레트 재사용(신규 색 금지).

## C. i18n

- `ko.ts`·`en.ts`의 `docs` 객체에 `tracingSetup`, `humanReview`(docs용; 최상위 `humanReview`와 별개), `rmfReport` 키 블록 신규 추가.
- 기존 `tracing`/`evaluations`/`dashboard` 키에 추가 텍스트.
- 모든 신규 문자열 ko/en 동시 추가(하드코딩 금지).

## D. 컨벤션·제약

- 색상: 모노톤 + `#10b981`/`#ef4444`. (RMF 등급 게이지·트레이싱 span 색은 기존 섹션이 이미 쓰는 브랜드 트레이싱 색 팔레트 범위 내 — 기존 `phoenix-tracing.tsx`/`dashboard.tsx` 선례를 따르며 신규 임의 색 도입 금지.)
- 각 신규 섹션 파일 500줄 이내. 초과 시 mock 데이터 분리.
- Typography/레이아웃은 기존 섹션 패턴(2xl 제목 등 docs 로컬 스타일) 그대로.
- `page.tsx` GROUPS/SECTION_COMPONENTS에 3개 항목 등록.

## 산출물 파일 목록

신규:
- `app/docs/sections/tracing-setup.tsx`
- `app/docs/sections/human-review.tsx`
- `app/docs/sections/rmf-report.tsx`

수정:
- `app/docs/page.tsx` (import·GROUPS·SECTION_COMPONENTS)
- `app/docs/sections/phoenix-tracing.tsx` (뷰 목업 갱신)
- `app/docs/sections/evaluations.tsx` (RMF eval·AI 언어)
- `app/docs/sections/dashboard.tsx`, `tracing` 링크
- `lib/i18n/ko.ts`, `lib/i18n/en.ts` (docs 키 블록)

## 비목표 (YAGNI)

- 실제 RMF 데이터 연동(목업은 정적 mock 데이터).
- Canvas 그래프 픽셀 단위 재현(근사로 충분).
- 사이드바 그룹 재편(기존 2그룹 유지).
- 새 공유 UI 컴포넌트 생성(기존 CodeBlock/Callout/DocTable/StatCard 패턴 재사용).
