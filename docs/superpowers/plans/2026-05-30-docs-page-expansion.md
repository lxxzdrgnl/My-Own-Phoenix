# 문서 페이지 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/docs` 문서 페이지에 트레이싱 연동(수동 span 계측)·사람 평가·금융 AI RMF 보고서 3개 섹션을 신설하고, 기존 트레이싱 뷰 목업을 현재 UI에 맞게 갱신한다.

**Architecture:** 기존 `app/docs/sections/*.tsx` 패턴(인터랙티브 목업 → 설명 → 표/코드 → Callout)을 그대로 따르는 신규 섹션 컴포넌트 3개 + `code-block.tsx`에 TS 하이라이터 추가 + `lib/i18n/{ko,en}.ts`에 docs 키 블록 추가 + `page.tsx` 사이드바 등록. 모든 텍스트는 i18n, 색은 모노톤 팔레트(+`#10b981`/`#ef4444`), mock 데이터는 정적.

**Tech Stack:** Next.js(App Router) · React client components · TypeScript · Tailwind · 자체 i18n(`useT`).

**검증 방식 (프로젝트 관례 반영):** 정적 문서 UI라 단위 테스트는 두지 않는다. 검증은 (1) PostEdit 훅 경고 확인, (2) **배치 끝 1회** `npx tsc --noEmit` + `next build`, (3) `npm run dev`로 시각 확인. per-task tsc 동시 실행 금지(경합) — 마지막 Task 9에서 일괄 검증.

**참고 파일(읽고 패턴 모방):**
- `app/docs/sections/phoenix-tracing.tsx`, `evaluations.tsx` — 섹션 구조·목업 패턴
- `app/docs/code-block.tsx` — `CodeBlock`/`Callout`/`DocTable`/`Md`
- `components/dashboard/widgets/ai-human-comparison.tsx` — 혼동행렬·산점도 로직
- `app/[slug]/rmf-report/rmf-report-body.tsx`, `rmf-helpers.tsx` — RMF 보고서 시각·등급
- 실제 span 계측 출처: `/home/rheon/Desktop/Projects/dexter-phoenix-pii-guard/src/{observability/telemetry.ts,agent/agent.ts,agent/tool-executor.ts,observability/guards/piiGuard.ts}`

---

## Task 1: CodeBlock에 TypeScript 하이라이터 추가

**Files:**
- Modify: `app/docs/code-block.tsx`

- [ ] **Step 1: TS 키워드/상수 세트 추가** (PY_CONST 정의 바로 아래, line ~21)

```ts
const TS_KW = new Set([
  "const","let","var","function","return","import","from","export","default",
  "new","class","interface","type","enum","extends","implements","async","await",
  "if","else","for","while","do","switch","case","break","continue","try","catch",
  "finally","throw","typeof","instanceof","in","of","as","void","public","private",
  "readonly","static","get","set","yield",
]);
const TS_CONST = new Set(["true","false","null","undefined","this","super"]);
```

- [ ] **Step 2: `hlTs` 함수 추가** (`hlPython` 함수 정의 바로 아래)

```ts
function hlTs(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < line.length) {
    // line comment
    if (line[i] === "/" && line[i + 1] === "/") {
      out.push(<span key={k++} style={{ color: C.cmt }}>{line.slice(i)}</span>);
      return out;
    }
    // string: ' " `
    if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
      const q = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== q) { if (line[j] === "\\") j++; j++; }
      j = Math.min(j + 1, line.length);
      out.push(<span key={k++} style={{ color: C.str }}>{line.slice(i, j)}</span>);
      i = j;
      continue;
    }
    // identifier / keyword
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[\w$]/.test(line[j])) j++;
      const w = line.slice(i, j);
      if (TS_KW.has(w)) out.push(<span key={k++} style={{ color: C.kw }}>{w}</span>);
      else if (TS_CONST.has(w)) out.push(<span key={k++} style={{ color: C.const }}>{w}</span>);
      else out.push(<span key={k++}>{w}</span>);
      i = j;
      continue;
    }
    let j = i;
    while (j < line.length && !/[/"'`a-zA-Z_$]/.test(line[j])) j++;
    out.push(<span key={k++}>{line.slice(i, j)}</span>);
    i = j;
  }
  return out;
}
```

- [ ] **Step 3: `highlight()`에 TS 분기 추가** (line ~90-94 교체)

```ts
function highlight(code: string, filename?: string): ReactNode {
  const isPy = filename?.endsWith(".py");
  const isBash = filename === "terminal" || filename?.endsWith(".sh");
  const isTs = filename?.endsWith(".ts") || filename?.endsWith(".tsx");
  if (!isPy && !isBash && !isTs) return code;
  const fn = isPy ? hlPython : isTs ? hlTs : hlBash;
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {i > 0 && "\n"}
      {fn(line)}
    </span>
  ));
}
```

- [ ] **Step 4: 커밋**

```bash
git add app/docs/code-block.tsx
git commit -m "feat(docs): CodeBlock TypeScript 구문 하이라이트 추가"
```

---

## Task 2: i18n 키 블록 추가 (ko.ts + en.ts)

새 docs 섹션 3종의 모든 문자열을 `docs` 객체 안에 추가한다. **ko/en 구조가 정확히 일치해야 함**(`Translations` 타입이 `en` 기준). 삽입 위치: `docs.playground` 객체 닫힘 직후, `docs` 닫힘(`},`) 직전 — ko.ts ~line 961, en.ts ~line 972.

- [ ] **Step 1: ko.ts에 `tracingSetup`/`humanReview`/`rmfReport` 추가**

`app/docs/sections/` 컴포넌트가 참조할 키. ko.ts의 playground 닫힘 `},`(line 961) 다음 줄에 삽입:

```ts
    tracingSetup: {
      groupLabel: "기능",
      title: "트레이싱 연동",
      subtitle: "트레이스 전송은 두 줄이면 끝나지만, 에이전트의 각 단계(계획·추론·툴·가드)는 코드에서 span으로 직접 나눕니다. 자동으로 잡히는 건 LLM SDK 호출뿐입니다.",
      connectHeading: "1. 트레이스 전송 설정",
      connectHelper: "에이전트 .env에 수집 엔드포인트와 트레이스 키만 넣으면 트레이스가 프로젝트로 흐릅니다. pt_ 키가 수신 프로젝트를 결정합니다.",
      autoVsManual: "2. 자동 계측 vs 수동 span",
      autoLabel: "자동 계측",
      autoDesc: "LLM SDK(OpenAI 등) instrumentor를 한 줄 등록하면 그 SDK 호출만 자동으로 span이 됩니다. 에이전트 흐름·툴·가드는 잡히지 않습니다.",
      autoFeatures: [
        "instrumentor 한 줄 등록 (new OpenAIInstrumentation())",
        "LLM 호출 span 자동 생성 (모델·토큰·입출력)",
        "에이전트 단계/툴/가드는 미포함",
      ],
      manualLabel: "수동 span",
      manualDesc: "에이전트 코드에서 startSpan으로 단계를 직접 span으로 나누고, 부모 context로 트리를 구성합니다.",
      manualFeatures: [
        "단계마다 startSpan(name, { SPAN_KIND }, parentCtx)",
        "AGENT → CHAIN → LLM/TOOL/GUARDRAIL 트리 구성",
        "setAttribute로 입력·출력·토큰 기록 후 end()",
      ],
      codeHeading: "3. 수동 span 계측 예시",
      codeHelper: "에이전트 한 번 실행을 AGENT span으로 감싸고, 반복마다 CHAIN/LLM, 툴 호출마다 TOOL span을 부모 아래에 중첩합니다. 탭으로 언어를 바꿔보세요.",
      langTs: "TypeScript",
      langPy: "Python",
      kindHeading: "Span 종류",
      treeHeading: "부모-자식 트리",
      treeDesc: "startSpan의 세 번째 인자(부모 context)가 트리 계층을 만듭니다. AGENT context를 push하고 그 아래 CHAIN을, CHAIN 아래 LLM을, 종료 시 pop하는 식으로 중첩 깊이를 관리합니다.",
      calloutTitle: "트레이스가 안 보일 때",
      calloutText: "체크: ① PHOENIX_COLLECTOR_ENDPOINT가 맞는가 ② pt_ 키가 그 프로젝트 키인가 ③ 프로젝트명이 일치하는가 ④ instrumentor를 SDK 사용 전에 등록했는가 ⑤ 아웃바운드 네트워크가 열려 있는가.",
    },
    humanReview: {
      groupLabel: "기능",
      title: "사람 평가",
      subtitle: "LLM 자동 평가가 맞는지 사람이 검증하고, AI 판정과 사람 판정의 불일치를 보고 eval 프롬프트를 개선합니다.",
      whyHeading: "왜 사람 평가인가",
      whyDesc: "LLM-as-judge도 틀립니다. 사람 라벨을 기준(ground truth)으로 두고 AI 판정과 비교하면, 불일치 패턴이 eval 프롬프트의 약점을 드러냅니다. 이 신호로 프롬프트(역할·과제·기준)를 교정합니다.",
      whereHeading: "어디서 하나",
      whereDesc: "사람 평가는 트레이싱 뷰에서 합니다. 트레이스 상세 → span의 Evals 탭 → 각 eval 행의 HUMAN 컬럼에서 Pass/Fail을 토글하거나 점수(%)와 설명을 입력합니다. 입력 즉시 아래 비교가 갱신됩니다.",
      whereStep1: "트레이싱 뷰에서 트레이스를 펼친다",
      whereStep2: "Evals 탭을 연다",
      whereStep3: "HUMAN 컬럼에서 Pass/Fail 또는 점수를 입력한다",
      whereStep4: "이 사람 평가 페이지에서 AI와의 일치/불일치를 집계해 본다",
      exampleHeading: "비교 화면",
      exampleHelper: "이 페이지는 사람 평가가 달린 트레이스를 모아 AI 판정과 비교합니다.",
      kpiCoverage: "사람평가 커버리지",
      kpiComparable: "비교 가능",
      kpiDisagreement: "불일치",
      kpiAgreement: "일치율",
      confusionTitle: "혼동행렬 (AI × Human)",
      scatterTitle: "점수 산점도",
      scatterX: "AI 점수",
      scatterY: "사람 점수",
      aiAxis: "AI",
      humanAxis: "HUMAN",
      pass: "통과",
      fail: "실패",
      agree: "일치",
      diff: "불일치",
      loopHeading: "개선 루프",
      loopStep1: "불일치 사례를 연다",
      loopStep2: "eval 프롬프트(역할·과제·기준)를 수정한다",
      loopStep3: "재평가하고 다시 비교한다",
      calloutTitle: "비교 조건",
      calloutText: "한 eval에 대해 AI와 HUMAN 어노테이션이 모두 있어야 비교 쌍이 됩니다. 사람 평가가 없는 트레이스는 커버리지에만 집계됩니다.",
    },
    rmfReport: {
      groupLabel: "기능",
      title: "금융 AI RMF 보고서",
      subtitle: "트레이스·평가·사람평가를 금융감독원 AI 위험관리 프레임워크(4부문 16항목)로 집계해 위험등급을 산정하고, 감독 대응용 A4 보고서를 발급합니다. (로컬 전용)",
      previewHeading: "보고서 미리보기",
      previewHelper: "대시보드와 보고서 출력을 탭으로 전환해보세요. ‘PDF로 저장’을 누르면 브라우저 인쇄로 보고서를 PDF로 받을 수 있습니다.",
      tabDashboard: "대시보드",
      tabReport: "보고서 출력",
      savePdf: "PDF로 저장",
      gradeLabel: "위험등급",
      totalLabel: "잔여위험 총점",
      tracesLabel: "분석 트레이스",
      findingsLabel: "지적 수",
      sectionRiskHeading: "부문별 위험도",
      problemHeading: "문제되는 트레이스",
      reportTitle: "금융 AI 위험평가 보고서",
      coverService: "대상 서비스",
      coverPeriod: "평가 기간",
      coverTraces: "분석 트레이스",
      coverHighRisk: "고위험 해당",
      coverAssessor: "평가자",
      coverDate: "생성일",
      overallHeading: "종합 위험등급",
      summaryHeading: "위험평가 요약",
      thSection: "부문",
      thItem: "항목",
      thInherent: "인식",
      thMitigation: "경감",
      thResidual: "잔여",
      thSubtotal: "소계",
      thTotal: "총점",
      findingsHeading: "주요 지적사항",
      humanBadge: "사람평가",
      howHeading: "동작 방식",
      howList: [
        "위험평가: 합법성(20)·신뢰성(30)·신의성실(20)·보안성(30) 4부문 16항목, 인식 − 경감 = 잔여위험으로 100점 환산",
        "eval→위험 prefill: 자동 평가 지표가 해당 위험항목 점수를 채우고, 사람평가/수동 입력으로 보정",
        "AI 종합 피드백: 종합 평가·주요 위험·우선 개선 권고를 LLM이 생성(대시보드 전용)",
        "버전 저장: 보고서 생성 시 자동 저장, 이전 버전 다시보기",
        "PDF 출력: 화면 미리보기 그대로 A4로 인쇄",
      ],
      grades: { low: "저위험", mid: "중위험", high: "고위험", veryhigh: "초고위험" },
      sections: { legality: "합법성", reliability: "신뢰성", good_faith: "신의성실", security: "보안성" },
      calloutTitle: "로컬 전용 · 금융 도메인",
      calloutText: "금융분야 AI RMF 보고서는 감독당국 제출 양식에 맞춘 로컬 전용 기능입니다. 위험항목·만점·등급밴드는 금융감독원 프레임워크 정의를 따릅니다.",
    },
```

- [ ] **Step 2: en.ts에 동일 키의 영문 추가** (en.ts playground 닫힘 `},` line 972 다음, docs 닫힘 직전)

ko.ts와 **동일한 키 구조**로 영문 값 작성. (키 이름·중첩·배열 길이 동일; 값만 영어.) 예: `title: "Tracing Setup"`, `langTs: "TypeScript"`, `grades: { low: "Low", mid: "Medium", high: "High", veryhigh: "Critical" }`, `sections: { legality: "Legality", reliability: "Reliability", good_faith: "Good Faith", security: "Security" }` 등. 모든 ko 키를 1:1로 옮긴다.

- [ ] **Step 3: evaluations에 AI 출력 언어 안내 키 추가** (ko.ts·en.ts `docs.evaluations` 객체 안, `calloutText` 다음 줄에 추가)

ko.ts:
```ts
      aiLanguageNote: "평가 설명과 RMF 종합 피드백을 생성할 언어(한국어/영어)는 프로젝트 설정에서 지정합니다 — 앱 인터페이스 언어와는 독립입니다.",
```
en.ts:
```ts
      aiLanguageNote: "The language for eval explanations and RMF feedback (Korean/English) is set in Project Settings — independent of the app interface language.",
```

- [ ] **Step 4: 커밋**

```bash
git add lib/i18n/ko.ts lib/i18n/en.ts
git commit -m "feat(docs): 트레이싱연동·사람평가·RMF보고서 i18n 키 추가"
```

---

## Task 3: 트레이싱 연동 섹션 (`tracing-setup.tsx`)

**Files:**
- Create: `app/docs/sections/tracing-setup.tsx`

- [ ] **Step 1: 섹션 컴포넌트 작성**

`phoenix-tracing.tsx`의 헤더/`space-y-10` 레이아웃과 `evaluations.tsx`의 2열 그리드(llmVsRule), form/raw 토글(`useState`) 패턴을 모방. `CodeBlock`/`Callout`/`DocTable`은 `../code-block`에서 import. 모든 텍스트는 `t.docs.tracingSetup.*`.

구성(위→아래):
1. 헤더: `groupLabel` / `title` / `subtitle` (phoenix-tracing 헤더 마크업 그대로).
2. **연동**: `connectHeading` + `connectHelper` + `<CodeBlock filename="terminal" code={ENV_CODE} />`.
   ```ts
   const ENV_CODE = `# 에이전트 .env
PHOENIX_COLLECTOR_ENDPOINT=https://phoenix.rheon.kr/api/collect
PHOENIX_API_KEY=pt_your_trace_key   # pt_ 키가 수신 프로젝트를 결정`;
   ```
3. **자동 vs 수동**: `autoVsManual` 제목 + 2열 그리드(evaluations llmVsRule 그리드 클래스 `grid gap-px grid-cols-2 rounded-xl border overflow-hidden bg-border` 재사용). 왼쪽 카드=자동(`autoLabel`/`autoDesc`/`autoFeatures` 불릿), 오른쪽=수동(`manualLabel`/`manualDesc`/`manualFeatures` 불릿). 배지: 자동="AUTO", 수동="MANUAL" (evaluations의 LLM/RULE 배지 스타일 복제).
4. **수동 span 코드 + 언어 탭**: `codeHeading` + `codeHelper`. 로컬 `const [lang, setLang] = useState<"ts" | "py">("ts")`. 탭 버튼 2개(`langTs`/`langPy`, evaluations form/raw 토글 버튼 스타일). 선택에 따라 `<CodeBlock filename={lang === "ts" ? "agent.ts" : "agent.py"} code={lang === "ts" ? TS_CODE : PY_CODE} />`.

   `TS_CODE` (dexter 실제 패턴 단순화):
   ```ts
   const TS_CODE = `import { trace, context as otelContext } from "@opentelemetry/api";
import { OITracer } from "@arizeai/openinference-core";
import {
  SemanticConventions as SC,
  OpenInferenceSpanKind as Kind,
  MimeType,
} from "@arizeai/openinference-semantic-conventions";

const tracer = new OITracer({ tracer: trace.getTracer("dexter") });

async function run(query: string) {
  // AGENT span — 전체 실행을 감싼다
  const agent = tracer.startSpan("Agent.run", {
    attributes: {
      [SC.OPENINFERENCE_SPAN_KIND]: Kind.AGENT,
      [SC.INPUT_VALUE]: query,
    },
  });
  const agentCtx = trace.setSpan(otelContext.active(), agent);

  // CHAIN + LLM span — 반복마다 부모(agentCtx) 아래 중첩
  const chain = tracer.startSpan("planning",
    { attributes: { [SC.OPENINFERENCE_SPAN_KIND]: Kind.CHAIN } },
    agentCtx,
  );
  const chainCtx = trace.setSpan(agentCtx, chain);

  const llm = tracer.startSpan("llm.chat",
    { attributes: {
        [SC.OPENINFERENCE_SPAN_KIND]: Kind.LLM,
        [SC.LLM_MODEL_NAME]: "gpt-4o",
      } },
    chainCtx,
  );
  // ... 모델 호출 ...
  llm.setAttribute(SC.LLM_TOKEN_COUNT_TOTAL, 14918);
  llm.setAttribute(SC.OUTPUT_VALUE, answer);
  llm.end();
  chain.end();

  // TOOL span — 툴 호출마다
  const tool = tracer.startSpan("tool.web_search",
    { attributes: { [SC.OPENINFERENCE_SPAN_KIND]: Kind.TOOL } },
    agentCtx,
  );
  tool.end();

  agent.setAttribute(SC.OUTPUT_VALUE, answer);
  agent.end();
}`;
   ```
   `PY_CODE` (동등 패턴):
   ```ts
   const PY_CODE = `from opentelemetry import trace
from openinference.semconv.trace import (
    SpanAttributes as SA,
    OpenInferenceSpanKindValues as Kind,
)

tracer = trace.get_tracer("dexter")

def run(query: str):
    # AGENT span — 전체 실행을 감싼다
    with tracer.start_as_current_span("Agent.run") as agent:
        agent.set_attribute(SA.OPENINFERENCE_SPAN_KIND, Kind.AGENT.value)
        agent.set_attribute(SA.INPUT_VALUE, query)

        # CHAIN + LLM span — with 블록 중첩이 부모-자식을 만든다
        with tracer.start_as_current_span("planning") as chain:
            chain.set_attribute(SA.OPENINFERENCE_SPAN_KIND, Kind.CHAIN.value)

            with tracer.start_as_current_span("llm.chat") as llm:
                llm.set_attribute(SA.OPENINFERENCE_SPAN_KIND, Kind.LLM.value)
                llm.set_attribute(SA.LLM_MODEL_NAME, "gpt-4o")
                # ... 모델 호출 ...
                llm.set_attribute(SA.LLM_TOKEN_COUNT_TOTAL, 14918)
                llm.set_attribute(SA.OUTPUT_VALUE, answer)

        # TOOL span — 툴 호출마다
        with tracer.start_as_current_span("tool.web_search") as tool:
            tool.set_attribute(SA.OPENINFERENCE_SPAN_KIND, Kind.TOOL.value)

        agent.set_attribute(SA.OUTPUT_VALUE, answer)`;
   ```
5. **Span 종류 표**: `kindHeading` + `<DocTable headers={[...]} rows={...}>`. 행: AGENT/CHAIN/LLM/TOOL/RETRIEVER/GUARDRAIL × [종류, 용도(한 줄), OpenInference kind]. 용도 텍스트는 인라인 한국어/영어가 아니라 — **간결히 i18n 회피 위해 표는 영문 고정 용어(AGENT/CHAIN/...)와 코드값만** 넣고, 설명 열은 `t.docs.tracingSetup`에 별도 키가 없으므로 **표의 설명 열은 생략하고 [Span kind, OpenInference value] 2열로** 구성(하드코딩 문자열 금지 준수).
   ```tsx
   <DocTable headers={["Span kind", "OpenInference value"]} rows={[
     ["AGENT", <code key="a">OpenInferenceSpanKind.AGENT</code>],
     ["CHAIN", <code key="c">OpenInferenceSpanKind.CHAIN</code>],
     ["LLM", <code key="l">OpenInferenceSpanKind.LLM</code>],
     ["TOOL", <code key="t">OpenInferenceSpanKind.TOOL</code>],
     ["RETRIEVER", <code key="r">OpenInferenceSpanKind.RETRIEVER</code>],
     ["GUARDRAIL", <code key="g">OpenInferenceSpanKind.GUARDRAIL</code>],
   ]} />
   ```
6. **트리 설명**: `treeHeading` + `treeDesc` (단락).
7. `<Callout title={t.docs.tracingSetup.calloutTitle}>{t.docs.tracingSetup.calloutText}</Callout>`.

export: `export function TracingSetup()`.

- [ ] **Step 2: 커밋**

```bash
git add app/docs/sections/tracing-setup.tsx
git commit -m "feat(docs): 트레이싱 연동 섹션(수동 span 계측·TS/Py 탭)"
```

---

## Task 4: 사람 평가 섹션 (`human-review.tsx`)

**Files:**
- Create: `app/docs/sections/human-review.tsx`

- [ ] **Step 1: mock 데이터 + 헬퍼**

`ai-human-comparison.tsx`의 혼동행렬/산점도 로직을 **목업용 정적 데이터**로 단순 재현. (실 데이터 fetch·import 없음.)

```ts
// 비교 쌍: ai/human 점수 (0~1), label
const PAIRS = [
  { eval: "hallucination", ai: 0.2, human: 1.0, diff: true },
  { eval: "hallucination", ai: 0.9, human: 0.0, diff: true },
  { eval: "citation",      ai: 0.7, human: 0.8, diff: false },
  { eval: "qa_correctness",ai: 1.0, human: 1.0, diff: false },
  { eval: "rag_relevance", ai: 0.9, human: 0.9, diff: false },
  { eval: "guardrail",     ai: 1.0, human: 0.4, diff: true },
];
// 혼동행렬 2x2: [HumanPass[AIpass,AIfail], HumanFail[AIpass,AIfail]]
const CM = { pp: 3, pf: 1, fp: 2, ff: 0 };
```

- [ ] **Step 2: 컴포넌트 작성**

구성(위→아래), 모든 텍스트 `t.docs.humanReview.*`:
1. 헤더(`groupLabel`/`title`/`subtitle`).
2. **왜 필요한가**: `whyHeading` + `whyDesc` 단락.
3. **어디서 하나**: `whereHeading` + `whereDesc` + 번호 스텝 리스트(`whereStep1..4`, evaluations howItWorks의 번호 원형 배지 마크업 재사용).
4. **비교 화면 목업** (`exampleHeading`/`exampleHelper`):
   - KPI 4카드: `<StatCard>`(`components/dashboard/widgets/stat-card`)를 `phoenix-tracing`/rmf-report와 동일하게 `h-28 rounded-xl border bg-card` 래퍼로 감싸 사용. 값=`5/8`(`kpiCoverage`,trend `63%`), `6`(`kpiComparable`), `3`(`kpiDisagreement`,trend `50% mismatch`), `50%`(`kpiAgreement`). **단**: StatCard는 `.react-grid-item` 조상에서만 리사이즈 감지 → 문서에선 normal 고정 렌더(문제없음).
   - 2열 그리드: 혼동행렬 카드 + 산점도 카드. 혼동행렬은 `ai-human-comparison.tsx`의 `ConfusionTab` 마크업(3열 grid, 셀 큰 숫자)을 정적 `CM` 값으로 복제(모노톤). 산점도는 `ScatterTab`의 SVG(360px, 대각선 기준선, match=빈원/diff=채운원)를 `PAIRS`로 복제. 축 라벨 `scatterX`/`scatterY`, 범례 `agree`/`diff`.
5. **개선 루프**: `loopHeading` + 번호 스텝(`loopStep1..3`).
6. `<Callout title={...calloutTitle}>{...calloutText}</Callout>`.

색은 전부 `currentColor`/`text-foreground`/`bg-foreground` 등 모노톤(ai-human-comparison가 이미 모노톤). export: `export function HumanReview()`.

- [ ] **Step 3: 커밋**

```bash
git add app/docs/sections/human-review.tsx
git commit -m "feat(docs): 사람 평가 섹션(혼동행렬·산점도·개선루프)"
```

---

## Task 5: RMF 보고서 섹션 (`rmf-report.tsx`)

**Files:**
- Create: `app/docs/sections/rmf-report.tsx`

- [ ] **Step 1: mock 데이터**

```ts
const SECTIONS = [
  { key: "legality",    weight: 20, subtotal: 14, pct: 70 },
  { key: "reliability", weight: 30, subtotal: 12, pct: 40 },
  { key: "good_faith",  weight: 20, subtotal: 9,  pct: 45 },
  { key: "security",    weight: 30, subtotal: 8,  pct: 27 },
];
const TOTAL = 43;            // 잔여위험 총점 → 중위험(25–49)
const GRADE = "mid";         // grades.mid
const GRADE_BANDS = [
  { key: "low", range: "0–24" }, { key: "mid", range: "25–49" },
  { key: "high", range: "50–74" }, { key: "veryhigh", range: "75–100" },
];
const SUMMARY_ROWS = [ /* {section, item, inherent, mitigation, residual} 8~12행 */ ];
const FINDINGS = [ /* {evalBadge, human?:bool, reason, query} 3~4개 */ ];
```

- [ ] **Step 2: 컴포넌트 + 탭 + 인쇄**

구성:
1. 헤더(`groupLabel`/`title`/`subtitle`).
2. 미리보기 영역(`previewHeading`/`previewHelper`):
   - 상단 바: 탭 토글 `const [tab, setTab] = useState<"dashboard"|"report">("dashboard")` (`tabDashboard`/`tabReport`) + 우측 **PDF 버튼** `savePdf`(아이콘 `FileDown`, `onClick={handlePrint}`).
   - **대시보드 탭**: 등급 게이지 히어로(밴드 4칸, 현재 등급 강조 — rmf-report-body의 GRADES 밴드 마크업을 모노톤+`#10b981`/`#ef4444` 한도로 복제하되 색은 `bg-foreground`/`text-background` 사용) + KPI 4카드(`gradeLabel`/`totalLabel`/`tracesLabel`/`findingsLabel`) + 부문별 막대(`sectionRiskHeading`, `SECTIONS`를 `t.docs.rmfReport.sections[key]`로 라벨, 막대는 `bg-foreground` 채움) + 문제 트레이스 카드(`problemHeading`, `FINDINGS` 간략 표시).
   - **보고서 출력 탭**: A4 시트(`<div className="rmf-doc-sheet ...">` — 흰 배경, 그림자, max-w). 표지(coverService/Period/Traces/HighRisk/Assessor/Date) + 종합등급(`overallHeading`, 밴드) + 요약표(`summaryHeading`, `DocTable` 또는 직접 table: thSection/thItem/thInherent/thMitigation/thResidual/thSubtotal, 마지막 행 thTotal) + 지적사항(`findingsHeading`, eval 배지 + `humanBadge`(초록 `#10b981`) + reason + query). rmf-report-body의 시각 스타일(border-neutral, text-[11px]) 참고하되 docs 다크모드 호환 위해 `border`/`text-muted-foreground` 토큰 사용.
3. **동작 방식**: `howHeading` + `howList`(불릿).
4. `<Callout title={calloutTitle}>{calloutText}</Callout>`.

**인쇄(PDF) 구현** — scoped print CSS:
```tsx
const sheetRef = useRef<HTMLDivElement>(null);
function handlePrint() {
  setTab("report");           // 보고서 탭 보장
  // 다음 페인트 후 인쇄
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}
```
컴포넌트 최상단에 print 전용 스타일 1회 주입(섹션 로컬 `<style>`):
```tsx
<style>{`
@media print {
  body * { visibility: hidden !important; }
  #rmf-print-sheet, #rmf-print-sheet * { visibility: visible !important; }
  #rmf-print-sheet { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; }
  @page { size: A4; margin: 14mm; }
}
`}</style>
```
보고서 시트 컨테이너에 `id="rmf-print-sheet"` 부여. (대시보드 탭일 때도 시트는 DOM에 존재하되 `hidden`이면 print에서 빠지므로, **인쇄 시 report 탭으로 먼저 전환** — handlePrint가 처리.) 시트는 항상 렌더하고 대시보드 탭일 때 `className`에 `hidden print:block` 토글로 두어 인쇄에 포함되게 한다.

export: `export function RmfReport()`.

- [ ] **Step 3: 커밋**

```bash
git add app/docs/sections/rmf-report.tsx
git commit -m "feat(docs): RMF 보고서 섹션(대시보드/보고서 탭 + PDF 인쇄)"
```

---

## Task 6: 기존 트레이싱 섹션 목업 갱신 (`phoenix-tracing.tsx`)

**Files:**
- Modify: `app/docs/sections/phoenix-tracing.tsx`

현재 UI 변경 반영. 기존 SVG 그래프 근사는 유지하되 정합성만 높인다.

- [ ] **Step 1: GUARDRAIL span 추가** — `KIND_STYLES`에 GUARDRAIL 항목 추가(icon "G", 빨강 계열 `text-[#ef4444]`/`bg-[#ef4444]/10`). `MOCK_SPANS` 트리에 tool1 다음 형제로 가드 span 추가:
```ts
{ id: "guard", name: "pii_guard", kind: "GUARDRAIL", latency: "0.02s", status: "ok",
  input: '{ "text": "내 카드번호 1234-..." }',
  output: '{ "triggered": true, "masked": "[REDACTED_CARD]" }' },
```
`GRAPH_NODES`에도 guard 노드 1개 추가(좌표는 tool1 근처, root children에 "guard" 포함) + `GRAPH_KIND_COLORS`에 GUARDRAIL(`border-[#ef4444]/30`, `iconBg bg-[#ef4444]`).

- [ ] **Step 2: 그래프 색상 정합** — `GRAPH_KIND_COLORS`의 iconBg를 실제 Canvas 값과 맞춤: AGENT `bg-[#171717]`, LLM `bg-[#059669]`, CHAIN `bg-[#2563eb]`, TOOL `bg-[#d97706]`, RETRIEVER `bg-[#db2777]`. (border는 각 색 `/30`.)

- [ ] **Step 3: IO/Evals/Raw 3탭 반영** — `TracePreview`의 detail 탭(`["input","output"]`)을 그대로 두되, 트레이스 헤더 아래에 **상위 탭 줄**(IO/Evals/Raw)을 추가하거나, 최소한 Evals 탭 mock을 한 블록 추가. 간결히: detail 영역 탭을 `["input","output","evals"]`로 확장하고 evals 선택 시 `MOCK_ANNOTATIONS`를 [Name | AI 배지 | Human Pass/Fail] 표로 렌더. i18n 불필요한 고정 라벨("Input"/"Output"/"Evals")은 현재도 영문 고정이므로 동일 처리.

- [ ] **Step 4: 타임라인 바 추가** — span tree 위 또는 그래프 위에, 루트 자식들의 latency 비율 막대 1줄 추가(planning 1.4s / tool 1.5s / guard 0.02s / reflection 13.3s → 비율 폭). 색은 Step 2 팔레트의 옅은 버전 또는 동일색 `/70`.

- [ ] **Step 5: tracing 섹션 i18n 링크 키** — `t.docs.tracing.calloutText` 끝 또는 새 키로 "연동 방법은 트레이싱 연동 섹션 참조" 한 줄. (ko/en 모두 기존 `tracing` 객체에 `setupLink` 키 추가, 마크업에서 사용.)

- [ ] **Step 6: 커밋**

```bash
git add app/docs/sections/phoenix-tracing.tsx lib/i18n/ko.ts lib/i18n/en.ts
git commit -m "feat(docs): 트레이싱 뷰 목업 갱신(GUARDRAIL·Evals탭·타임라인·색정합)"
```

---

## Task 7: evaluations·dashboard 텍스트 갱신

**Files:**
- Modify: `app/docs/sections/evaluations.tsx`, `app/docs/sections/dashboard.tsx`

- [ ] **Step 1: evaluations에 AI 언어 안내 단락** — `Evaluations()`의 howItWorks `<ol>` 다음, `<Callout>` 앞에 단락 추가:
```tsx
<div>
  <h3 className="text-sm font-semibold mb-4">{t.docs.evaluations.aiLanguageNote ? "AI 출력 언어" : ""}</h3>
  <p className="text-sm text-muted-foreground leading-relaxed">{t.docs.evaluations.aiLanguageNote}</p>
</div>
```
(제목도 i18n로: ko `aiLanguageTitle: "AI 출력 언어"`, en `"AI output language"` 키를 evaluations에 추가하고 위 `? :` 대신 `{t.docs.evaluations.aiLanguageTitle}` 사용.)

- [ ] **Step 2: dashboard에 RMF 보고서 링크 한 줄** — `nistFrameworkDesc` 단락 끝에 "상세 보고서는 RMF 보고서 섹션 참조" 한 줄(ko/en `dashboard.rmfReportLink` 키 추가 후 사용).

- [ ] **Step 3: 커밋**

```bash
git add app/docs/sections/evaluations.tsx app/docs/sections/dashboard.tsx lib/i18n/ko.ts lib/i18n/en.ts
git commit -m "feat(docs): evaluations AI언어 안내 + dashboard RMF 링크"
```

---

## Task 8: page.tsx 사이드바 등록

**Files:**
- Modify: `app/docs/page.tsx`

- [ ] **Step 1: import 추가** (line 16 `import { Playground }` 다음)
```tsx
import { TracingSetup } from "./sections/tracing-setup";
import { HumanReview } from "./sections/human-review";
import { RmfReport } from "./sections/rmf-report";
```

- [ ] **Step 2: SECTION_COMPONENTS 매핑 추가**
```tsx
  tracing: PhoenixTracing,
  "tracing-setup": TracingSetup,
  evaluations: Evaluations,
  "human-review": HumanReview,
  dashboard: Dashboard,
  "rmf-report": RmfReport,
```
(기존 키 사이에 삽입 — tracing 뒤 tracing-setup, evaluations 뒤 human-review, dashboard 뒤 rmf-report.)

- [ ] **Step 3: GROUPS features 배열에 항목 추가**
```tsx
        { id: "tracing", label: t.docs.tracing.title },
        { id: "tracing-setup", label: t.docs.tracingSetup.title },
        { id: "evaluations", label: t.docs.evaluations.title },
        { id: "human-review", label: t.docs.humanReview.title },
        { id: "dashboard", label: t.docs.dashboard.title },
        { id: "rmf-report", label: t.docs.rmfReport.title },
        { id: "datasets", label: t.docs.datasets.title },
        { id: "chat", label: t.docs.chat.title },
        { id: "playground", label: t.docs.playground.title },
```

- [ ] **Step 4: 커밋**

```bash
git add app/docs/page.tsx
git commit -m "feat(docs): 신규 3개 섹션 사이드바 등록"
```

---

## Task 9: 일괄 검증 (배치 끝 1회)

**Files:** 없음 (검증만)

- [ ] **Step 1: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 0. (특히 ko.ts/en.ts 구조 불일치 시 `Translations` 타입 에러 → 누락 키 보정.)

- [ ] **Step 2: 빌드**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: 시각 확인**

Run: `npm run dev` 후 `http://localhost:3000/docs`
확인:
- 사이드바 "기능"에 트레이싱 연동 / 사람 평가 / RMF 보고서 노출, 순서 정상.
- 트레이싱 연동: TS/Python 탭 전환 시 코드·하이라이트 정상.
- 사람 평가: KPI·혼동행렬·산점도 렌더, 모노톤.
- RMF 보고서: 대시보드/보고서 탭 전환, **PDF로 저장 클릭 → 인쇄 미리보기에 보고서 시트만** 보임.
- 트레이싱(기존): GUARDRAIL span·Evals 탭·타임라인 노출.
- ko/en 토글 시 모든 신규 텍스트 번역됨.

- [ ] **Step 4: 최종 커밋(필요 시 미세 수정)**

```bash
git add -A
git commit -m "fix(docs): 타입·빌드·시각 검증 보정"
```

---

## Self-Review 메모

- **스펙 커버리지**: 트레이싱연동(T3)·사람평가(T4)·RMF+PDF(T5)·트레이싱뷰갱신(T6)·evaluations AI언어/dashboard링크(T7)·TS하이라이터(T1)·i18n(T2)·등록(T8)·검증(T9). 모든 스펙 항목 대응됨. eval 6종은 스펙대로 제외.
- **타입 일관성**: 컴포넌트 export명(`TracingSetup`/`HumanReview`/`RmfReport`)과 page.tsx import/매핑 일치. i18n 키명은 컴포넌트 참조와 Task2 정의가 동일.
- **하드코딩 주의**: 표의 영문 고정 용어(AGENT/Input/Output/Evals 등 코드·기술 토큰)는 기존 섹션도 영문 고정이므로 허용. 그 외 서술 문자열은 전부 i18n.
- **색 규칙**: 신규 임의 색 없음. 트레이싱 그래프 색은 기존 phoenix-tracing가 이미 쓰는 값과 실제 Canvas 값. RMF/사람평가는 모노톤 + `#10b981`/`#ef4444` 한도.
