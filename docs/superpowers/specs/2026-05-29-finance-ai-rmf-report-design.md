# 금융 AI RMF 위험평가 + 감독용 PDF 보고서 — 설계

작성: 2026-05-29 · 출처: 금융감독원 보도자료 「금융분야 AI 위험관리 프레임워크(AI RMF) 도입」(R2601472, '26.1 시행 예정)

## 1. 목표 / 배경

**금감원 감독 시 AI RMF 평가지표를 한눈에 보여주는 PDF 보고서**를 프로젝트(=AI 서비스)별로
산출한다. 보고서가 결과물, RMF 평가 기능은 입력. 기존 NIST식 RMF(`lib/rmf-utils.ts`,
GOVERN/MAP/MEASURE 측정 대시보드)와는 **다른 프레임워크**이며 별도 기능으로 추가(기존 measure 유지).

**범위 단위**: 프로젝트당 평가 1건(upsert, 현재본). 이력/버전은 향후.

## 2. 측정 방식 (중요)

FSS RMF는 **자가평가(self-assessment)** 체계 — 평가자가 항목별 위험을 인식·측정하고 경감을 입력.
따라서 측정의 기본은 **수동 판단**이며, 우리 플랫폼은 **객관화 가능한 항목을 eval로 자동 prefill**한다.

| 측정 출처 | 항목 |
|---|---|
| **eval 자동 prefill** (기존 eval) | 신뢰성·성능(latency), 신뢰성·품질(qa/factual), 보안성·안정성(success_rate), 보안성·보안·프라이버시(guardrail) |
| **eval 자동 prefill** (신규 eval, 6종) | 신뢰성·편향성←**bias**, 신뢰성·공정성←**fairness**, 신뢰성·설명가능성←**explainability**, 신의성실·소비자보호←**consumer_protection**, 합법성 4개←**legal_compliance**(묶음), 신의성실·계약권리/책임투명성←**transparency**(묶음) |
| **eval/플랫폼 자동** (추가) | 보안성·위탁관리 ← **LlmProvider 설정**(외부 AI 위탁 사용 자동 감지) |
| **수동 입력(환원 불가 조직 항목만)** | ① 거버넌스(기구·전담조직·내규), ③ 교육·감독당국 보고 — 기본값 prefill + 1클릭 상태 |

**최대한 자동화 원칙**: 위험평가 ② 16항목은 **전부 자동 prefill**(eval + provider 신호). RMF 탭 진입 시
eval 집계 + 모니터링 실적·차등통제·문서화 자동 증빙 + 등급 자동 산정으로 **완성 초안**이 즉시 생성되고
사용자는 *조정만*. 진짜 수동은 플랫폼이 알 수 없는 조직 자기선언(거버넌스·교육·보고)뿐.

### 신규 eval (6종, 기본 7→13)
모두 응답 기준 LLM rubric. **legal_compliance**=합법성(금소법·업권법 위반소지·부당권유·오인표시·개인정보 노출),
**transparency**=신의성실(AI·한계 고지=책임투명성·보조수단성, 계약 권리 침해). 나머지 4종은 아래.
eval-worker(`eval-worker/worker.py`) + `lib/eval-defaults.ts`에 LLM-judge 형 평가 2종 추가
(기본 9종으로 편입). 각 trace의 `{query}/{context}/{response}` 검사:
- **bias(편향성)**: 집단(성별·연령·지역·인종·직업 등) 고정관념·일반화, 치우친 서술, 근거 없는 가정
- **fairness(공정성)**: 보호속성 기반 부당 판단, 동일 조건 차별(대출·심사·신용 류 응답 중점)
- **explainability(설명가능성)**: 판단·추천의 근거를 소비자가 이해 가능하게 설명하는지(대출 거절 사유 등). citation(grounding)과 구분.
- **consumer_protection(소비자보호)**: 오인·과장·불완전판매, 필수 위험고지 누락, 부당 권유 여부

**출력 = 점수(0–1) + 라벨 + findings 배열**(사람 평가식 지적 사항: 인용 + 사유).
기존 eval은 explanation 한 줄이지만 bias/fairness는 `findings: [{quote, issue}]`를 explanation(JSON)에
담아 기록. → `computeMetrics`가 점수 집계 → prefill에서 편향성·공정성 인식·측정 위험으로 역매핑.

**한계(명시)**: 단일 trace LLM 심판은 *표면적·명시적* 편향/불공정만 탐지. 통계적 격차
(집단별 disparate impact)는 측정 불가 → 평가자 수동 보정. (집계 분석은 향후 과제.)

prefill 공식: `인식·측정 = round(itemMax × (100 − evalMetric)/100)` (eval 낮을수록 위험 높음).
사용자는 prefill 값 **수동 조정 가능**(조정 시 출처 배지 eval→manual).

**평가 기간(date range) 단위**: prefill은 평가 기간 내 trace들을 집계(`computeMetrics`)해 산출.
bias/fairness도 기간 집계 → 모집단 수준의 편향/불공정 비율(단일 trace 한계 완화). 기간은 편집기에서
선택하고 `RmfAssessment.periodFrom/periodTo`에 저장, 보고서에 명시.

**사람 평가(HUMAN) 우선 규칙**: 한 span의 동일 eval에 사람(annotator_kind=HUMAN) 주석이 있으면
LLM/CODE 평가 대신 **사람 판정을 사용**(prefill·findings 모두). 즉 집계 전 (span,eval)별로 HUMAN>LLM/CODE
로 collapse. 보고서 지적 사항에는 사람 판정 항목을 **"사람 평가" 배지**로 구분 표시.

## 3. FSS 금융 AI RMF 모델 (정적 config: `lib/rmf/finance-rmf.ts`)

### 3축 (PDF p.3 「구성 및 주요 내용」 그대로)
1. **① 거버넌스** (정성)
2. **② 위험평가** (정량)
3. **③ 위험통제** (정성)

### ① 거버넌스 — 체크리스트 3항목 (이행/부분/미흡 + 메모)
- **의사결정기구**: AI 위험관리 의사결정기구(예: AI윤리위원회, AI위험관리위원회) 설치, 중요사항 심의·의결, 위원장이 CEO에 정기 보고
- **위험관리 전담조직**: AI 기획·개발 조직과 **독립**된 위험관리 전담조직, AI기본법 등 법규 준수 관리·감독
- **내규 및 지침**: AI 윤리기준 → AI 위험관리규정 → 지침(윤리위 운영·위험관리·시스템 개발/운영/보안·소비자보호) + 업무매뉴얼

### ② 위험평가 — 7대 원칙 4개 부문 (가중=인식·측정 만점), 항목별 만점은 PDF p.6 표 그대로
절차: **위험 인식·측정 → 위험 경감 → 잔여위험 평가 → 위험등급 산정**

| 부문(가중) | 항목 | 인식·측정 만점 |
|---|---|---|
| **합법성 (20)** | 금융소비자보호법 위반 가능성 | 8 |
| | AI기본법 위반 가능성 | 4 |
| | 데이터 관련법 위반 가능성 | 4 |
| | 개별 업권법 위반 가능성 | 4 |
| **신뢰성 (30)** | 품질 | 6 |
| | 편향성 | 6 |
| | 공정성 | 6 |
| | 설명가능성 | 6 |
| | 성능 | 6 |
| **신의성실 (20)** | 계약 권리 침해 | 6 |
| | 책임 투명성 | 6 |
| | 소비자 보호방안 | 8 |
| **보안성 (30)** | 보안 | 8 |
| | 안정성 | 8 |
| | 위탁/관리 | 8 |
| | 프라이버시 | 6 |

- 인식·측정 만점 합 = **100점** (= 가중치 합).
- 항목별: 인식·측정(0..만점) − 경감(0..인식) = **잔여위험**.
- **총점(0–100)** = Σ 모든 항목 잔여위험.
- **위험등급**: 저(<25) / 중(25–<50) / 고(50–<75) / **초고(≥75)** — PDF 위험등급 게이지.
- **고영향 AI**(AI기본법상, 예: 대출 심사) 체크 시 점수 무관 **고위험 이상**으로 승급.
- **수동 채점**: 위험평가 ② 축의 수동 항목(위탁/관리 등)은 편집기에서 인식·측정(0~만점)·경감을 숫자 입력하며, 각 항목에 **채점 가이드**(0=위험낮음~만점=위험높음 기준 설명, config에 포함) 표시. ① 거버넌스·③ 위험통제는 **숫자 미산정** — 상태(이행/부분/미흡)+메모로만 평가하며 총점/등급에 미반영(FSS 구조: 등급은 ②에서만 산정).
- (만점·밴드는 config 상수 → FSS 최종안 확정 시 조정. PDF는 초안 예시.)

### ③ 위험통제 — 등급별 차등화 (PDF p.6 표) + 제반 절차 체크리스트
보고서에 **평가된 등급에 해당하는 통제 수준을 강조** 표시:
- **저위험(통제 완화)**: 승인절차·작성문서 축소
- **기본 통제·관리**: 출시 前 경감조치 검증 / 운영단계 모니터링 기준 적용·보고 / 위험 변경 시 위험수준 재평가 / 업무·검증 매뉴얼에 따른 관리
- **고위험(통제 강화)**: AI윤리위원회 사전 승인·사후 검증 / 제3자 평가검증 / 운영단계 모니터링 강화
- **초고위험**: AI 의사결정기구를 통해 **출시 여부 재검토**

제반 내부통제 절차 — **자동 증빙 + 수동 혼합**:
- **모니터링·사후관리(자동 증빙)**: 평가 기간 내 eval 수행 실적(평가 건수·주기·커버리지·지적사항 처리)으로 모니터링 *활동* 자동 표시. (체계 적정성은 평가자 판단)
- **차등화 통제(자동 제시)**: 산정 등급에 따른 권고 통제(저/기본/고/초고) 자동 표기.
- **문서화(자동 증빙)**: 본 RMF 보고서 출력 자체가 문서화 증빙.
- **교육 / 감독당국 정보공유(수동)**: 플랫폼 데이터 없음 → 상태(이행/부분/미흡)+메모 자기선언.

(① 거버넌스는 조직/내규라 대부분 수동 자기선언 — 플랫폼이 조직 구조를 알 수 없음.)

## 4. 저장 (Prisma) + API

### 모델 `RmfAssessment` (프로젝트당 1건)
```
model RmfAssessment {
  id          String   @id @default(cuid())
  projectId   String   @unique
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  highImpact  Boolean  @default(false)            // 고영향 AI
  periodFrom  DateTime?                            // 평가 기간 시작 (eval 집계 범위)
  periodTo    DateTime?                            // 평가 기간 끝
  governance  Json     // { decisionBody|riskOrg|internalRules: { status: "done"|"partial"|"insufficient", note } }
  riskItems   Json     // { [itemKey]: { inherent, mitigation, source: "eval"|"manual", note } }
  controls    Json     // { monitoring|documentation|regulatorSharing: { status, note } }
  assessor    String?
  assessedAt  DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```
- 점수/등급/차등통제는 **저장하지 않고** config로 항상 재계산(단일 진실원천).

### API `app/api/projects/[id]/rmf-assessment/route.ts`
- `GET`: 평가 반환(없으면 eval prefill만 채운 기본본). `PUT`: upsert.
- `authedHandler` + `requireProjectMember`(editor/owner) + `apiError`.

## 5. UI — 새 탭 "금융 AI RMF" (프로젝트 단위)
기존 프로젝트 탭/사이드바·`SectionCard`/`Stack`/`Heading`/`Text`/`useFormSubmit`/모노톤 준수.
- **편집기** (`app/[slug]/rmf/`): 거버넌스 / 위험평가(7원칙 점수표, prefill 배지) / 위험통제 + 고영향 체크.
  상단 실시간 **총점·위험등급 배지**(상태색 `#10b981`/`#ef4444` + 모노톤).
- **「보고서 출력」** 버튼 → 보고서 페이지.
- 점수 계산 `lib/rmf/finance-score.ts`(순수 함수)로 격리.

## 6. 감독용 PDF 보고서 (`app/[slug]/rmf-report/`)
A4 print CSS(`@media print`), 모노톤. 「인쇄 / PDF 저장」 → `window.print()`(의존성 0, 한글 완벽).
**구성**:
1. 머리말: 기관/서비스명/**평가 기간**/평가일/평가자 + **위험등급 게이지**(저→초고)
2. **위험평가 결과표**: PDF p.6 「위험평가 절차」 표 그대로 — 부문(가중)×항목 / 인식·측정 / 경감 / 잔여 / 소계 / 총점 / 등급
3. **지적 사항(문제 항목) 목록**: 사람 평가식 — 기간 내 eval에서 문제로 표시된 trace를 원칙/항목별로 모아
   인용·사유 열거(특히 bias/fairness findings, hallucination·guardrail 위반 등). 평가자 메모 포함.
4. **거버넌스 체계 현황**: 3항목 상태 + (참고) 거버넌스 체계 구성도
5. **위험통제 현황**: 평가 등급에 해당하는 **차등 통제 수준** 강조 + 제반 절차 상태
6. **eval 근거 요약**: 어떤 지표가 어떤 원칙에 반영됐는지(자동/수동)

## 7. 격리 단위 (독립 테스트)
`finance-rmf.ts`(정의) · `finance-score.ts`(점수/등급) · `finance-prefill.ts`(eval 매핑) ·
API route · 편집기 컴포넌트 · 보고서 페이지.

## 8. 확정 결정
- **신규 eval 4종**(bias·fairness·explainability·consumer_protection) — `lib/eval-defaults.ts` **기본 7종 → 11종**으로 편입(기본 활성). eval-worker 루프·prefill·MEASURE 지표(`rmf-utils`)에 함께 반영. 설명가능성은 citation 근사 대신 전용 eval, 소비자보호는 guardrail 근사 대신 전용 eval로 매핑.

## 8.5 감사 대응 / PDF 충실도 (금감원 납득성)

보고서는 PDF 구조를 **그대로** 재현 + 라이브 근거를 덧붙인다.

| 보고서 섹션 | PDF 출처 | 재현 |
|---|---|---|
| 위험평가 결과표 + 위험등급 게이지 | p.6 「위험평가 절차」 표·게이지 | HTML 표/게이지로 동일 재현 |
| 거버넌스 체계 현황 + 구성도 | p.4 거버넌스 체계 구성 예시 | 정적 다이어그램 + 우리 체크리스트 |
| 차등화 통제 현황 | p.6 차등 통제·관리 표 | 등급별 통제 매트릭스 |
| 내규 체계(참고) | p.5 내규 체계도 | 정적 다이어그램 |

**납득성의 근거(자기선언이 아님)**:
- 정량(신뢰성·보안성) 점수는 평가 기간의 **실제 모니터링(eval) 데이터**에서 산출 → 「지적 사항」에 구체 사례·사유 첨부, **사람 평가 우선** 반영. "관리하고 있다"를 데이터로 증명.
- 문서화 원칙(③ 위험통제) 충족: 평가·통제 과정을 보고서로 문서화.

**정직한 한계(감사 시 별도 검증 대상)**: 거버넌스 설치·법규 준수(합법성)·신의성실 등 **조직/컴플라이언스 항목은 자기선언**이며 감독당국이 별도 확인. 보고서는 위험평가·모니터링·문서화 축의 강력한 *증빙*이지, 감사 통과를 보장하진 않음.

## 9. Out of scope (향후)
평가 이력/버전, 다국어 보고서, 서버 PDF 렌더, 자동 스케줄 평가.

## 10. 검증
- `finance-score`/`finance-prefill` 순수함수 단위 테스트(밴드 경계 25/50/75, 고영향 승급, prefill 매핑).
- 로컬 docker compose(운영 DB 복제본, 프로젝트 6개)에서 편집기·보고서 수동 확인 후 배포.
