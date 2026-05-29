// 금융 AI RMF (FSS) 공유 타입

export type Grade = "저" | "중" | "고" | "초고";
export type ChecklistStatus = "done" | "partial" | "insufficient";
export type RiskSource = "eval" | "provider" | "manual";

/** 위험평가 세부 항목 정의 (정적) */
export interface RiskItemDef {
  key: string;            // 안정적 식별자 (DB 저장 키)
  label: string;          // 표시명 (FSS 표 그대로)
  maxInherent: number;    // 인식·측정 만점 (PDF p.6)
  /** eval 자동 prefill 소스 metric id (rmf-utils MEASURE_METRICS). 없으면 수동/특수. */
  evalMetricId?: string;
  /** provider 설정 신호로 prefill (위탁/관리). */
  providerSignal?: boolean;
  /** 수동 채점 가이드 (0=위험낮음 ~ 만점=위험높음). */
  scoringGuide: string;
}

/** 위험평가 부문 (7대 원칙 중 정량 4) */
export interface RiskSectionDef {
  key: string;
  label: string;
  weight: number;         // = 부문 인식·측정 만점 합
  items: RiskItemDef[];
}

/** 정성 체크리스트 항목 (거버넌스 / 위험통제) */
export interface ChecklistItemDef {
  key: string;
  label: string;
  description: string;
  /** 플랫폼 데이터로 자동 증빙 가능한 항목 (모니터링·차등통제·문서화). */
  autoEvidenced?: boolean;
}

// ── 평가 상태 (DB 저장 / 계산 입력) ──

export interface RiskItemState {
  inherent: number;       // 0..maxInherent
  mitigation: number;     // 0..inherent
  source: RiskSource;
  note?: string;
}

export interface ChecklistItemState {
  status: ChecklistStatus;
  note?: string;
}

export interface AssessmentState {
  highImpact: boolean;
  periodFrom?: string;
  periodTo?: string;
  riskItems: Record<string, RiskItemState>;        // key → state
  governance: Record<string, ChecklistItemState>;
  controls: Record<string, ChecklistItemState>;
  assessor?: string;
}

/** 사람 평가식 지적 사항 (보고서 「지적 사항」). */
export interface Finding {
  sectionKey: string;
  itemKey: string;
  spanId: string;         // 근거 트레이스 연결용
  eval: string;           // eval name
  label: string;
  score: number;
  reason: string;         // explanation
  annotatorKind: "LLM" | "CODE" | "HUMAN";
}

/** 점수 산정 결과. */
export interface ScoreResult {
  perItemResidual: Record<string, number>;
  sectionSubtotals: Record<string, number>;
  total: number;          // 0..100
  grade: Grade;
}
