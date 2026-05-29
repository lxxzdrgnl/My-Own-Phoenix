// AI 출력 언어 — 자동 평가 설명 / 금융 AI RMF 종합 피드백 등 LLM 생성 텍스트의 언어 통일.
// project-scoped 설정 evalLanguage("ko"|"en")로 제어. 기본 "ko".
// (eval-worker(worker.py)는 동일 의미의 KOREAN_OUTPUT_INSTRUCTION 상수를 별도 보유 — 언어가 달라 공유 불가.)

export const EVAL_LANGUAGES = ["ko", "en"] as const;
export type EvalLanguage = (typeof EVAL_LANGUAGES)[number];

/** 입력값을 유효한 언어로 정규화 (기본 ko). */
export function normalizeEvalLanguage(value?: string | null): EvalLanguage {
  return value === "en" ? "en" : "ko";
}

const INSTRUCTIONS: Record<EvalLanguage, string> = {
  // JSON 키·label/enum 값은 영어 유지(라벨 매칭용), 그 외 자연어 텍스트만 해당 언어.
  ko: "중요: 출력 JSON의 키와 'label'·enum 값은 지정된 영어 그대로 유지하고, 그 외 모든 자연어 텍스트(설명·이유·내용 등)는 반드시 한국어로 작성하세요.",
  en: "Important: keep JSON keys and any specified label/enum values in English, and write all other natural-language text (explanations, reasons, content) in English.",
};

/** 언어별 출력 지시문. */
export function languageInstruction(value?: string | null): string {
  return INSTRUCTIONS[normalizeEvalLanguage(value)];
}

/** 시스템 메시지에 언어 지시를 합성. */
export function applyLanguageToSystem(system: string | null | undefined, value?: string | null): string {
  const inst = languageInstruction(value);
  return system ? `${system}\n\n${inst}` : inst;
}
