/**
 * PII Guard — 3-stage detection & masking engine.
 * Ported from dexter-phoenix-pii-guard.
 *
 * Stage 1: Regex-based pattern matching (RRN, bank account, phone, credit card, email)
 * Stage 1.5: Deterministic normalizer (Korean numerals, reversed, spaced email, demographic)
 * Stage 2: LLM-based (placeholder — not wired)
 */

export type PIIType = "rrn" | "bank_acct" | "phone_kr" | "credit_card" | "email" | "demographic";

export interface PIIDetection {
  type: PIIType;
  start: number;
  end: number;
  match: string;
  confidence: number;
}

export interface PiiGuardResult {
  action: "allow" | "mask" | "block";
  maskedText: string;
  detections: PIIDetection[];
  stageDetections: {
    stage1: PIIDetection[];
    deterministic: PIIDetection[];
    stage2: PIIDetection[];
  };
  stageStats: {
    stage1Count: number;
    deterministicCount: number;
    stage2Count: number;
    stage2Used: boolean;
    latencyMs: number;
  };
}

// ─── Stage 1: Regex patterns ───

const PATTERNS: Partial<Record<PIIType, RegExp>> = {
  rrn: /\b\d(?:\s*\d){5}\s*[-.@_*]?\s*[1-4](?:\s*\d){6}\b/g,
  bank_acct: /\b\d(?:\s*\d){1,3}\s*[-.@_*]\s*\d(?:\s*\d){1,5}\s*[-.@_*]\s*\d(?:\s*\d){3,7}\b/g,
  phone_kr: /\b0\s*1\s*[016789]\s*[-.@_*]?\s*\d(?:\s*\d){2,3}\s*[-.@_*]?\s*\d(?:\s*\d){3}\b/g,
  credit_card: /\b\d(?:\s*\d){3}\s*[-.@_*]?\s*\d(?:\s*\d){3}\s*[-.@_*]?\s*\d(?:\s*\d){3}\s*[-.@_*]?\s*\d(?:\s*\d){3}\b/g,
  email: /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Za-z]{2,}\b/g,
};

const POSITIVE_KEYWORDS: Record<PIIType, string[]> = {
  rrn: ["주민", "주민번호", "주민등록", "신원", "인증", "KYC", "신용평가"],
  bank_acct: ["계좌", "입금", "송금", "잔액", "은행", "이체", "신한", "국민", "농협", "우리"],
  phone_kr: ["휴대폰", "전화", "연락처", "번호", "SMS", "알림", "핸드폰", "문자"],
  credit_card: ["카드", "결제", "결재", "카드번호", "신용카드", "자동결제"],
  email: ["이메일", "email", "메일", "주소"],
  demographic: [],
};

const NEGATIVE_KEYWORDS: Record<PIIType, string[]> = {
  rrn: [],
  bank_acct: ["시가총액", "매출", "영업이익", "CUSIP", "ISIN", "주문번호", "거래번호"],
  phone_kr: ["시가총액", "종가", "거래번호", "체결"],
  credit_card: ["주문번호", "거래번호", "식별자", "CUSIP", "ISIN"],
  email: ["github", "git@", "SSH", "저장소", "repo"],
  demographic: [],
};

const TYPE_PRIORITY: Record<PIIType, number> = {
  rrn: 5,
  credit_card: 4,
  phone_kr: 3,
  email: 3,
  bank_acct: 2,
  demographic: 1,
};

const CONTEXT_WINDOW = 20;
const STRICT_BASE_CONFIDENCE = 0.85;
const KEYWORD_BOOST = 0.10;
const NEGATIVE_KEYWORD_PENALTY = 0.40;
const LUHN_FAILURE_PENALTY = 0.40;
const MIN_CONFIDENCE_THRESHOLD = 0.50;

// ─── Stage 1.5: Deterministic normalizer patterns ───

const KOREAN_DIGITS: Record<string, string> = {
  공: "0", 영: "0", 령: "0", 일: "1", 이: "2", 삼: "3",
  사: "4", 오: "5", 육: "6", 륙: "6", 칠: "7", 팔: "8", 구: "9",
};

const CONTEXT_KEYWORDS_RE: Record<PIIType, RegExp> = {
  rrn: /주민|주민번호|주민등록|RRN|신원|KYC/i,
  bank_acct: /계좌|은행|입금|송금|이체|잔액/i,
  phone_kr: /휴대폰|핸드폰|전화|연락처|SMS|알림/i,
  credit_card: /카드|신용카드|결제|자동결제/i,
  email: /이메일|email|메일/i,
  demographic: /거주|사는|여성|남성|직장인|다니는|나이|프로필/i,
};

const REVERSED_HINT = /역순|거꾸로|뒤집/i;
const NUMBERISH_RE = /\d[\d\s\-.@_*]{7,}\d/g;
const KOREAN_NUMERAL_RE = /[공영령일이삼사오육륙칠팔구][공영령일이삼사오육륙칠팔구\s\-.@_*]*/g;
const SPACED_EMAIL_RE = /\b(?:[A-Za-z]\s*)+(?:\.\s*(?:[A-Za-z]\s*)+)*@\s*(?:[A-Za-z]\s*)+(?:\.\s*(?:[A-Za-z]\s*)+)+\b/g;

const DEMOGRAPHIC_PATTERNS: RegExp[] = [
  /(?:서울\s*)?강남구\s*역삼동에?\s*사는\s*\d{2}세\s*[가-힣]씨\s*(?:남성|여성)/g,
  /(?:서울\s*)?강남구\s*거주\s*\d{2}대\s*(?:초반|중반|후반)?\s*(?:남성|여성)\s*[가-힣]씨/g,
  /\d{4}년\s*\d{1,2}월생\s*(?:남성|여성)\s*[가-힣]씨/g,
  /[가-힣A-Za-z0-9]+(?:전자|은행|증권|보험|회사)?\s*다니는\s*\d{2}세\s*[가-힣]씨\s*직장인/g,
];

// ─── Core functions ───

export function regexDetect(text: string): PIIDetection[] {
  const detections: PIIDetection[] = [];
  for (const [type, pattern] of Object.entries(PATTERNS) as [PIIType, RegExp][]) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const match = m[0];
      const start = m.index;
      const end = start + match.length;
      const confidence = computeConfidence(text, type, start, end, match);
      if (confidence < MIN_CONFIDENCE_THRESHOLD) continue;
      detections.push({ type, start, end, match, confidence });
    }
  }
  return dedupeOverlapping(detections);
}

export function deterministicDetect(text: string): PIIDetection[] {
  return dedupeOverlapping([
    ...detectKoreanNumerals(text),
    ...detectSpacedEmail(text),
    ...detectReversedNumbers(text),
    ...detectDemographic(text),
  ]);
}

export function maskText(text: string, detections: PIIDetection[]): string {
  const sorted = [...detections].sort((a, b) => b.start - a.start);
  let result = text;
  for (const det of sorted) {
    const tag = `[REDACTED_${det.type.toUpperCase()}]`;
    result = result.slice(0, det.start) + tag + result.slice(det.end);
  }
  return result;
}

export function dedupeOverlapping(detections: PIIDetection[]): PIIDetection[] {
  const sorted = [...detections].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: PIIDetection[] = [];
  for (const det of sorted) {
    const overlap = kept.find((k) => det.start < k.end && det.end > k.start);
    if (!overlap) {
      kept.push(det);
      continue;
    }
    if (shouldReplace(det, overlap)) {
      kept[kept.indexOf(overlap)] = det;
    }
  }
  return kept;
}

export function runGuard(text: string, stage2Mode: "auto" | "force" | "skip" = "auto"): PiiGuardResult {
  const startedAt = Date.now();

  const stage1 = regexDetect(text);
  const deterministic = deterministicDetect(text);
  const combined = dedupeOverlapping([...stage1, ...deterministic]);
  // Stage 2 (LLM) — placeholder, not implemented in this project
  const stage2: PIIDetection[] = [];

  let action: "allow" | "mask" | "block" = "allow";
  let maskedText = text;

  if (combined.length > 0) {
    action = "mask";
    maskedText = maskText(text, combined);
  }

  return {
    action,
    maskedText,
    detections: combined,
    stageDetections: { stage1, deterministic, stage2 },
    stageStats: {
      stage1Count: stage1.length,
      deterministicCount: deterministic.length,
      stage2Count: 0,
      stage2Used: false,
      latencyMs: Date.now() - startedAt,
    },
  };
}

// ─── Internal helpers ───

function computeConfidence(text: string, type: PIIType, start: number, end: number, match: string): number {
  let confidence = STRICT_BASE_CONFIDENCE;
  if (hasKeyword(text, POSITIVE_KEYWORDS[type], start, end)) confidence += KEYWORD_BOOST;
  if (hasKeyword(text, NEGATIVE_KEYWORDS[type], start, end)) confidence -= NEGATIVE_KEYWORD_PENALTY;
  if (type === "credit_card" && !luhnCheck(match)) confidence -= LUHN_FAILURE_PENALTY;
  return Math.min(1, Math.max(0, confidence));
}

function hasKeyword(text: string, keywords: string[], start: number, end: number): boolean {
  if (keywords.length === 0) return false;
  const wStart = Math.max(0, start - CONTEXT_WINDOW);
  const wEnd = Math.min(text.length, end + CONTEXT_WINDOW);
  const window = text.slice(wStart, wEnd);
  return keywords.some((kw) => window.includes(kw));
}

function luhnCheck(cardLike: string): boolean {
  const digits = cardLike.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function shouldReplace(newer: PIIDetection, older: PIIDetection): boolean {
  const np = TYPE_PRIORITY[newer.type];
  const op = TYPE_PRIORITY[older.type];
  if (np !== op) return np > op;
  if (newer.confidence !== older.confidence) return newer.confidence > older.confidence;
  return newer.end - newer.start > older.end - older.start;
}

function contextWindow(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start - 24), Math.min(text.length, end + 24));
}

function koreanDigitsToAscii(value: string): string {
  let digits = "";
  for (const ch of value) {
    if (KOREAN_DIGITS[ch] !== undefined) digits += KOREAN_DIGITS[ch];
  }
  return digits;
}

function trimTrailingSeparators(value: string): string {
  return value.replace(/[\s\-.@_*]+$/g, "");
}

function classifyDigits(digits: string, ctx: string, _raw: string): PIIType | null {
  if (/^01[016789]\d{7,8}$/.test(digits)) return "phone_kr";
  if (/^\d{6}[1-4]\d{6}$/.test(digits)) return "rrn";
  if (CONTEXT_KEYWORDS_RE.credit_card.test(ctx) && digits.length >= 13 && digits.length <= 19) return "credit_card";
  if (CONTEXT_KEYWORDS_RE.bank_acct.test(ctx) && digits.length >= 10 && digits.length <= 14) return "bank_acct";
  if (CONTEXT_KEYWORDS_RE.rrn.test(ctx) && digits.length === 13) return "rrn";
  if (CONTEXT_KEYWORDS_RE.phone_kr.test(ctx) && digits.length >= 10 && digits.length <= 11) return "phone_kr";
  return null;
}

function classifyReversedDigits(digits: string, ctx: string, raw: string): PIIType | null {
  if (CONTEXT_KEYWORDS_RE.credit_card.test(ctx) && digits.length >= 13 && digits.length <= 19) return "credit_card";
  if (CONTEXT_KEYWORDS_RE.phone_kr.test(ctx) && digits.length >= 10 && digits.length <= 11) return "phone_kr";
  if (CONTEXT_KEYWORDS_RE.rrn.test(ctx) && digits.length === 13) return "rrn";
  if (CONTEXT_KEYWORDS_RE.bank_acct.test(ctx) && digits.length >= 10 && digits.length <= 14) return "bank_acct";
  return classifyDigits(digits, ctx, raw);
}

// ─── Stage 1.5 detectors ───

function detectKoreanNumerals(text: string): PIIDetection[] {
  const out: PIIDetection[] = [];
  KOREAN_NUMERAL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = KOREAN_NUMERAL_RE.exec(text)) !== null) {
    const raw = trimTrailingSeparators(match[0]);
    if (!raw) continue;
    const digits = koreanDigitsToAscii(raw);
    if (digits.length < 10) continue;
    const type = classifyDigits(digits, contextWindow(text, match.index, match.index + raw.length), raw);
    if (!type) continue;
    out.push({ type, start: match.index, end: match.index + raw.length, match: raw, confidence: 0.92 });
  }
  return out;
}

function detectSpacedEmail(text: string): PIIDetection[] {
  const out: PIIDetection[] = [];
  SPACED_EMAIL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SPACED_EMAIL_RE.exec(text)) !== null) {
    if (!/\s/.test(match[0])) continue;
    out.push({ type: "email", start: match.index, end: match.index + match[0].length, match: match[0], confidence: 0.9 });
  }
  return out;
}

function detectReversedNumbers(text: string): PIIDetection[] {
  if (!REVERSED_HINT.test(text)) return [];
  const out: PIIDetection[] = [];
  NUMBERISH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NUMBERISH_RE.exec(text)) !== null) {
    const raw = trimTrailingSeparators(match[0]);
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 10) continue;
    const reversed = [...digits].reverse().join("");
    const ctx = contextWindow(text, match.index, match.index + raw.length);
    const type = classifyReversedDigits(reversed, ctx, raw);
    if (!type) continue;
    out.push({ type, start: match.index, end: match.index + raw.length, match: raw, confidence: 0.9 });
  }
  return out;
}

function detectDemographic(text: string): PIIDetection[] {
  const out: PIIDetection[] = [];
  for (const pattern of DEMOGRAPHIC_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      out.push({ type: "demographic", start: match.index, end: match.index + match[0].length, match: match[0], confidence: 0.86 });
    }
  }
  return out;
}
