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
| **eval 자동 prefill** (기존 eval) | 신뢰성·성능(latency), 신뢰성·품질(qa/factual), 신뢰성·설명가능성(citation), 보안성·안정성(success_rate), 보안성·보안·프라이버시(guardrail) |
| **eval 자동 prefill** (신규 eval) | 신뢰성·편향성 ← **bias eval**, 신뢰성·공정성 ← **fairness eval** (eval-worker에 신규 추가, 확정) |
| **수동 입력** | 합법성 4개(법규 준수), 신의성실 3개, 거버넌스·위험통제 전체 |

### 신규 eval (bias / fairness)
eval-worker(`eval-worker/worker.py`) + `lib/eval-defaults.ts`에 LLM-judge 형 평가 2종 추가
(기본 9종으로 편입). 각 trace의 `{query}/{context}/{response}` 검사:
- **bias(편향성)**: 집단(성별·연령·지역·인종·직업 등) 고정관념·일반화, 치우친 서술, 근거 없는 가정
- **fairness(공정성)**: 보호속성 기반 부당 판단, 동일 조건 차별(대출·심사·신용 류 응답 중점)

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
- (만점·밴드는 config 상수 → FSS 최종안 확정 시 조정. PDF는 초안 예시.)

### ③ 위험통제 — 등급별 차등화 (PDF p.6 표) + 제반 절차 체크리스트
보고서에 **평가된 등급에 해당하는 통제 수준을 강조** 표시:
- **저위험(통제 완화)**: 승인절차·작성문서 축소
- **기본 통제·관리**: 출시 前 경감조치 검증 / 운영단계 모니터링 기준 적용·보고 / 위험 변경 시 위험수준 재평가 / 업무·검증 매뉴얼에 따른 관리
- **고위험(통제 강화)**: AI윤리위원회 사전 승인·사후 검증 / 제3자 평가검증 / 운영단계 모니터링 강화
- **초고위험**: AI 의사결정기구를 통해 **출시 여부 재검토**

제반 내부통제 절차 체크리스트(이행/부분/미흡): **모니터링·사후관리 / 문서화 및 교육 / 감독당국 정보공유**.

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
- **bias / fairness eval 신규 추가** — `lib/eval-defaults.ts`의 **기본 eval 7종 → 9종**으로 편입(기존처럼 기본 활성). eval-worker·prefill·MEASURE 지표(`rmf-utils`)에도 함께 반영.

## 9. Out of scope (향후)
평가 이력/버전, 다국어 보고서, 서버 PDF 렌더, 자동 스케줄 평가.

## 10. 검증
- `finance-score`/`finance-prefill` 순수함수 단위 테스트(밴드 경계 25/50/75, 고영향 승급, prefill 매핑).
- 로컬 docker compose(운영 DB 복제본, 프로젝트 6개)에서 편집기·보고서 수동 확인 후 배포.
