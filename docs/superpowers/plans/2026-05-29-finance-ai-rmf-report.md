# 금융 AI RMF 위험평가 + 감독용 PDF 보고서 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) 로 task 단위 실행. 각 phase 끝에 로컬(운영 DB 복제본)에서 검증.

**Goal:** 금감원 감독에 제출 가능한 「금융분야 AI RMF」 위험평가 + 감독용 PDF 보고서를 프로젝트별로 산출.

**Architecture:** FSS 프레임워크를 정적 config로 코드화(`lib/rmf/finance-*`), 순수 점수엔진 + eval prefill(사람평가 우선) → 편집기 탭 + print 보고서. 평가는 `RmfAssessment`(project당 1건, 기간 단위)로 저장. bias/fairness eval을 기본 9종으로 추가.

**Tech Stack:** Next.js(custom server, tsx) · Prisma/Postgres · 기존 eval-worker(Python) · 기존 `computeMetrics` · print CSS(`window.print()`).

**금융 RMF 특화 원칙(전체 관통):** FSS 용어 그대로(금융소비자보호법·AI기본법·개별 업권법·대출심사 고영향·신용/대출 차별 관점 bias/fairness), 보고서는 금감원 보도자료 톤(부문·가중·위험등급 게이지). 범용 eval 대시보드처럼 보이지 않게.

---

## File Structure

- `lib/rmf/finance-rmf.ts` — 프레임워크 정의(3축, 7원칙 4부문, 항목·만점·가중, 등급 밴드, 거버넌스/통제 체크 항목, 차등통제 매트릭스). 정적.
- `lib/rmf/finance-score.ts` — 순수 점수/등급 계산(잔여위험 합산, 밴드, 고영향 승급).
- `lib/rmf/finance-prefill.ts` — eval 집계(기간) → 항목 인식·측정 위험 역매핑 + 사람평가(HUMAN) 우선 collapse + findings 추출.
- `lib/rmf/types.ts` — 공유 타입(RiskItemState, AssessmentState, Grade, Finding).
- `app/api/projects/[id]/rmf-assessment/route.ts` — GET/PUT(upsert).
- `prisma/schema.prisma` — `RmfAssessment` 모델(+ Project relation).
- `app/[slug]/rmf/page.tsx` + `rmf-view.tsx` — 편집기 탭.
- `app/[slug]/rmf-report/page.tsx` + `rmf-report-view.tsx` — print 보고서.
- `components/rmf/*` — 위험평가표/게이지/체크리스트/지적사항 등 보고서·편집기 공용 컴포넌트.
- eval 추가: `lib/eval-defaults.ts`(bias·fairness 정의), `eval-worker/worker.py`(평가 로직), `lib/rmf-utils.ts`(MEASURE 지표 2종).

---

## Phase 1 — 보고서 MVP (실물 확인 우선)

목표: 새 eval/DB 없이 **기존 eval 데이터 + prefill만으로 보고서를 렌더**해 로컬에서 실물 확인.
거버넌스/통제는 빈(미입력) 상태, 위험평가는 prefill 자동값, 지적사항은 기존 annotation에서 집계.

### Task 1.1: 프레임워크 정의 `lib/rmf/finance-rmf.ts` + 타입
- Create: `lib/rmf/types.ts`, `lib/rmf/finance-rmf.ts`
- 내용: 4부문(합법성20/신뢰성30/신의성실20/보안성30) × 항목(만점: 금소법8·AI기본법4·데이터법4·업권법4 / 품질6·편향성6·공정성6·설명가능성6·성능6 / 계약권리6·책임투명성6·소비자보호8 / 보안8·안정성8·위탁관리8·프라이버시6) — 합 100.
  등급 밴드 `{저:0,중:25,고:50,초고:75}`. 거버넌스 3항목·통제 제반 3항목 + 차등통제 매트릭스(저/기본/고/초고) 텍스트. eval 매핑 키(어느 항목이 어느 eval metric id에서 prefill되는지).
- [ ] Step 1: 타입 정의 — `Grade="저"|"중"|"고"|"초고"`, `RiskItem{key,label,sectionKey,maxInherent,evalMetricId?}`, `Section{key,label,weight,items}`.
- [ ] Step 2: `FINANCE_RMF` 상수(부문·항목·만점·밴드·체크항목) 작성.
- [ ] Step 3: 자체 검증 — 항목 만점 합 === 100, 부문 만점 === 가중치. (간단 단위 테스트 `lib/rmf/__tests__/finance-rmf.test.ts`)
- [ ] Step 4: 테스트 통과 확인. Commit.

### Task 1.2: 점수 엔진 `lib/rmf/finance-score.ts` (TDD)
- Create: `lib/rmf/finance-score.ts`, `lib/rmf/__tests__/finance-score.test.ts`
- 함수: `computeFinanceRisk(items: Record<key,{inherent,mitigation}>, highImpact: boolean): { perItemResidual, sectionSubtotals, total, grade }`.
  - residual = clamp(inherent−mitigation, 0, maxInherent); total = Σ residual(0–100); grade = band(total); highImpact면 최소 "고".
- [ ] Step 1: 실패 테스트 — 예시(PDF p.6, 총점 54 → "고"), 경계(24→저,25→중,49→중,50→고,74→고,75→초고), 고영향(총점 10이어도 "고").
- [ ] Step 2: FAIL 확인.
- [ ] Step 3: 구현.
- [ ] Step 4: PASS. Commit.

### Task 1.3: prefill + 지적사항 `lib/rmf/finance-prefill.ts` (TDD)
- Create: `lib/rmf/finance-prefill.ts`, `__tests__/finance-prefill.test.ts`
- 입력: `MetricValue[]`(computeMetrics 결과) + 원시 annotations(기간). 출력: 항목별 prefill inherent(`round(maxInherent*(100-metric)/100)`, source) + `findings: Finding[]`(문제 annotation: 원칙/항목/eval/label/score/explanation/annotatorKind).
  - **사람평가 우선**: (span,evalName)별 HUMAN > LLM/CODE collapse 후 집계·findings.
- [ ] Step 1: 실패 테스트 — metric 80→inherent=round(max*0.2); HUMAN fail이 LLM faithful을 덮어씀; findings에 problematic만, human은 "사람평가" 표시.
- [ ] Step 2: FAIL. Step 3: 구현. Step 4: PASS. Commit.

### Task 1.4: 보고서 공용 컴포넌트 `components/rmf/`
- Create: `components/rmf/risk-gauge.tsx`(저→초고 게이지), `risk-assessment-table.tsx`(부문×항목 표), `findings-list.tsx`(지적사항), `checklist-status.tsx`, `govern-diagram.tsx`(거버넌스 체계 정적도), `control-matrix.tsx`(차등통제). 모노톤+`#10b981`/`#ef4444`.
- [ ] Step 1~: 각 컴포넌트 props 기반 작성(데이터는 부모 주입). 표/게이지는 PDF p.6 구조 그대로. Commit.

### Task 1.5: 보고서 페이지 `app/[slug]/rmf-report/`
- Create: `app/[slug]/rmf-report/page.tsx`(client), `rmf-report-view.tsx`
- 데이터: 현재 프로젝트로 `fetchSpansAndAnnotations`(기간=최근 30일 기본) → `computeMetrics` → `finance-prefill` → `finance-score`. (DB 없이 prefill-only assessment)
- 레이아웃: 머리말(서비스/기간/등급 게이지) → 위험평가표 → 지적사항 → 거버넌스/통제(현재 미입력 안내) → eval 근거. print CSS(A4) + 「인쇄/PDF 저장」 버튼(`window.print()`).
- [ ] Step 1~: 페이지 작성, 라우팅(사이드바 임시 링크 or 직접 URL). tsc + 로컬 빌드.
- [ ] Step 2: **로컬 확인** — `http://localhost:3000/<slug>/rmf-report`에서 restaurant/dexter 프로젝트로 실물 PDF 출력 확인(지적사항 실제 데이터). 사용자 리뷰.
- [ ] Step 3: Commit.

**▶ Phase 1 종료: 사용자가 로컬에서 실제 보고서 PDF를 보고 납득성/충실도 판단.**

---

## Phase 2 — 저장 + 편집기 (수동 보정·기간·거버넌스/통제)

### Task 2.1: Prisma 모델 + 마이그레이션
- Modify: `prisma/schema.prisma` — `RmfAssessment`(spec §4) + `Project`에 relation 추가.
- [ ] Step 1: 모델 추가. Step 2: `npx prisma migrate dev --name rmf_assessment`(로컬). Step 3: `npx prisma generate`. Commit.

### Task 2.2: API route (TDD-lite)
- Create: `app/api/projects/[id]/rmf-assessment/route.ts`
- GET: 평가 반환(없으면 prefill만 채운 기본본 + 기간 기본 30일). PUT: upsert. `authedHandler`+`requireProjectMember(editor)`+`apiError`. 응답 단일 리소스 raw.
- [ ] Step 1: route 작성(기존 `app/api/projects/[id]/providers` 패턴 따름). Step 2: 로컬에서 curl GET/PUT 확인. Commit.

### Task 2.3: 편집기 탭 `app/[slug]/rmf/`
- Create: `app/[slug]/rmf/page.tsx`, `rmf-view.tsx`; Modify: `components/project-sidebar.tsx`(탭/링크 추가)
- 섹션: 기간(DateRangePicker) + 고영향 체크 / 거버넌스 3항목(상태+메모) / 위험평가 7원칙 점수표(prefill 배지, inherent·mitigation 입력) / 위험통제 제반 3항목. 상단 실시간 총점·등급 배지. 저장=`useFormSubmit`→PUT. 「보고서 출력」 버튼.
- [ ] Step 1~: 작성(`SectionCard`/`Stack`/`Heading`/`Text`/모노톤). Step 2: 보고서 페이지를 DB 평가 우선(없으면 prefill) 사용하도록 연결. Step 3: 로컬 확인(입력→저장→보고서 반영). Commit.

**▶ Phase 2 종료: 로컬 확인.**

---

## Phase 3 — bias / fairness eval 신규(기본 9종)

### Task 3.1: eval 정의 추가 `lib/eval-defaults.ts`
- Modify: `lib/eval-defaults.ts` — `bias`, `fairness` 추가(evalType llm_prompt, outputMode score, badgeLabel BIAS/FAIR). 프롬프트: 금융 맥락(대출·신용·심사) 차별/편향 검사 + **findings 배열** 반환 JSON(`{label,score,findings:[{quote,issue}],explanation}`).
- [ ] Step 1: 정의 추가. Step 2: 로컬에서 신규 프로젝트/시드에 반영되는지(글로벌 seed) 확인. Commit.

### Task 3.2: eval-worker 처리 `eval-worker/worker.py`
- Modify: `eval-worker/worker.py` — bias/fairness를 LLM-judge로 실행(기존 내장 eval 패턴), score 산출, findings는 explanation(JSON)에 기록.
- [ ] Step 1: 구현. Step 2: 로컬 eval-worker가 dexter 등에서 bias/fairness 평가·기록하는지 로그 확인. Commit.

### Task 3.3: MEASURE 지표 + prefill 연결
- Modify: `lib/rmf-utils.ts`(MEASURE_METRICS에 bias_rate·fairness_rate 추가, computeMetrics 매핑), `lib/rmf/finance-rmf.ts`(편향성←bias, 공정성←fairness evalMetricId).
- [ ] Step 1: 추가. Step 2: 보고서에서 편향성·공정성이 prefill되는지 확인. Commit.

**▶ Phase 3 종료: 로컬 확인.**

---

## Phase 4 — 마감

### Task 4.1: 보고서 지적사항·차등통제 다듬기 + eval 근거표
- 등급별 차등통제 강조, eval 근거 요약표(자동/수동·사람평가 배지), 인쇄 여백/페이지 분할 점검.
- [ ] Step 1~: 폴리시. 로컬 인쇄 미리보기 확인. Commit.

### Task 4.2: 통합 검증 + 배포
- [ ] Step 1: `npx tsc --noEmit` + `npx next build` 통과. Step 2: 로컬 전체 플로우 확인. Step 3: 사용자 최종 확인 후 push → CI 자동 배포(수동 배포 금지). prod에서 `prisma migrate deploy` 자동 적용 확인.

---

## Self-Review

- **Spec coverage**: §2 측정/사람평가우선→T1.3, §3 모델→T1.1·T2.1, 점수→T1.2, prefill→T1.3, eval 9종→Phase3, API→T2.2, 편집기→T2.3, 보고서/지적사항→T1.4·1.5·4.1, 기간→T2.1·2.3, 감사충실도→T1.4·1.5. 누락 없음.
- **Placeholder**: 각 task에 파일경로·핵심 로직·검증 명시. 세부 코드는 실행 시 spec 수치(만점/밴드) 사용.
- **Type consistency**: Grade/RiskItem/Finding은 `lib/rmf/types.ts` 단일 정의를 score·prefill·컴포넌트가 공유.
