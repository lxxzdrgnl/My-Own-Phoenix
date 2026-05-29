# 금융 AI RMF 위험평가 + 감독용 PDF 보고서 — 설계

작성: 2026-05-29

## 1. 목표 / 배경

금융감독원 「금융분야 AI 위험관리 프레임워크(AI RMF)」(2026.1 시행 예정, 보도자료
`R2601472`)에 맞춰, **금감원 감독 시 AI RMF 평가지표를 한눈에 보여주는 PDF 보고서**를
프로젝트(=AI 서비스)별로 산출한다. 보고서가 최종 결과물이고, RMF 평가 기능은 그 입력이다.

기존 `lib/rmf-utils.ts`의 NIST식 RMF(GOVERN/MAP/MEASURE 측정 대시보드)와는 **다른
프레임워크**이며, 별도 기능으로 추가한다(기존 measure 대시보드는 그대로 유지).

**범위 단위**: 프로젝트당 평가 1건(upsert, 현재본). 이력/버전은 향후 과제.

## 2. FSS 금융 AI RMF 모델 (정적 config: `lib/rmf/finance-rmf.ts`)

### 3축
1. **거버넌스** (정성): 의사결정기구 / 위험관리 전담조직 / 내규·지침
2. **위험평가** (정량): 7대 원칙 가중 점수 → 위험등급
3. **위험통제** (정성): 차등화 통제 / 모니터링·사후관리 / 문서화·교육 / 감독당국 정보공유

### 위험평가 — 7대 원칙 4개 카테고리 (가중치) 및 하위 항목
- **합법성 (20%)**: 금융소비자보호법 위반 가능성, AI기본법 위반 가능성, 데이터 관련법 위반 가능성, 개별 업권법 위반 가능성
- **신뢰성 (30%)**: 품질, 편향성, 공정성, 설명가능성, 성능
- **신의성실 (20%)**: 계약 권리 침해, 책임 투명성, 소비자 보호방안
- **보안성 (30%)**: 보안, 안정성, 위탁/관리, 프라이버시

### 점수 산정
- 항목별: **위험 인식·측정**(inherent, 0–10) − **위험 경감**(mitigation, 0–inherent) = **잔여위험**(0–10)
- 카테고리 잔여율 = (Σ 항목 잔여 / Σ 항목 최대) × 100
- **총점(0–100)** = Σ_카테고리 (가중치 × 카테고리 잔여율)
- **위험등급**: 저(<25) / 중(25–<50) / 고(50–<75) / 초고(≥75)
- **고영향 AI** 체크 시: 점수와 무관하게 최소 **고위험**으로 승급
- 주: 밴드 임계값(25/50/75)·항목 최대점수는 config 상수로 두어 FSS 최종 가이드라인 확정 시 조정 가능. (PDF는 초안 예시)

## 3. eval 자동 prefill (하이브리드)

기존 `computeMetrics(spans, annotations)` 결과(0–100, 높을수록 좋음)를 해당 항목의
**인식·측정 위험**으로 역매핑: `inherentRisk = round((100 − metric)/10)` (0–10).
사용자는 prefill 값을 **수동 조정 가능**(조정 시 prefill 배지 → 수동 표시).

| 원칙·항목 | eval 지표 | 비고 |
|---|---|---|
| 신뢰성·성능 | latency_score | |
| 신뢰성·품질 | factual_rate, qa_accuracy 평균 | |
| 신뢰성·설명가능성 | citation_accuracy | |
| 보안성·안정성 | success_rate | |
| 보안성·프라이버시/보안 | guardrail_pass | |
| 그 외(합법성·신의성실·편향성·공정성·거버넌스·통제) | — | 수동 입력 |

매핑은 `lib/rmf/finance-prefill.ts`에 격리. eval 데이터 없으면 prefill 생략(수동).

## 4. 저장 (Prisma) + API

### 모델 `RmfAssessment` (프로젝트당 1건)
```
model RmfAssessment {
  id            String   @id @default(cuid())
  projectId     String   @unique
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  highImpact    Boolean  @default(false)   // 고영향 AI
  governance    Json     // 거버넌스 체크리스트 상태/메모
  riskItems     Json     // 항목별 {key, inherent, mitigation, source: "eval"|"manual", note}
  controls      Json     // 위험통제 체크리스트 상태/메모
  assessor      String?  // 평가자
  assessedAt    DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```
- 점수/등급은 **저장하지 않고** config 기반으로 항상 재계산(단일 진실원천).

### API `app/api/projects/[id]/rmf-assessment/route.ts`
- `GET`: 평가 반환(+ eval prefill 병합 결과). 없으면 prefill만 채운 기본본.
- `PUT`: upsert. `authedHandler` + `requireProjectMember`(editor/owner) + `apiError`.

## 5. UI — 새 탭 "금융 AI RMF" (프로젝트 단위)

기존 프로젝트 탭/사이드바 패턴 재사용. 컴포넌트는 `useFormSubmit`/`SectionCard`/`Stack`/
`Heading`/`Text`/모노톤 팔레트 준수.

- **평가 편집기** (`app/[slug]/rmf/`): 거버넌스 / 위험평가(7원칙 점수, prefill 배지) / 위험통제
  3개 `SectionCard`. 상단에 실시간 **총점·위험등급 배지**(저/중/고/초고, 상태색 `#10b981`/`#ef4444` + 모노톤).
- **「보고서 출력」 버튼** → 보고서 페이지로 이동.
- 점수 계산은 `lib/rmf/finance-score.ts`(순수 함수)로 격리 → 편집기·보고서·테스트 공용.

## 6. 감독용 PDF 보고서 페이지 (`app/[slug]/rmf-report/`)

A4 print CSS(`@media print`), 모노톤. 화면에선 미리보기, 「인쇄 / PDF 저장」 버튼 →
`window.print()`. 의존성 0, 한글 완벽.

**구성(한눈에)**:
1. 머리말: 기관/서비스(프로젝트)명/평가일/평가자 + **위험등급 게이지**(저→초고)
2. **위험평가 결과표**: PDF 「AI 서비스 위험평가 절차」 표 그대로 — 원칙(가중%)×항목 / 인식·측정 / 경감 / 잔여 / 카테고리 소계 / 총점 / 등급
3. 거버넌스 체계 현황(체크리스트 상태)
4. 위험통제 현황(체크리스트 상태)
5. eval 근거 요약: 어떤 지표가 어떤 원칙에 반영됐는지(자동/수동 표시)

## 7. 격리 단위 (독립 테스트 가능)
- `lib/rmf/finance-rmf.ts` — 프레임워크 정의(원칙·항목·가중치·밴드)
- `lib/rmf/finance-score.ts` — 순수 점수/등급 계산
- `lib/rmf/finance-prefill.ts` — eval → 인식·측정 위험 매핑
- API route — 영속화
- 편집기 컴포넌트 / 보고서 페이지 — UI

## 8. Out of scope (향후)
- 평가 이력/버전 비교, 다국어 보고서(현재 ko 중심), 서버 PDF 렌더, 자동 스케줄 평가.

## 9. 검증
- `finance-score`/`finance-prefill` 순수 함수 단위 테스트(밴드 경계, 고영향 승급, prefill 매핑).
- 로컬 docker compose(운영 DB 복제본, 프로젝트 6개)에서 편집기·보고서 수동 확인 후 배포.
