/**
 * Format date for display — locale-aware.
 * Pass "ko" for Korean format (2026년 5월 14일), "en" for English (May 14, 2026).
 */
export function formatDateTime(date: string | Date, locale?: string): string {
  const loc = locale === "en" ? "en-US" : "ko-KR";
  return new Date(date).toLocaleString(loc, {
    year: "numeric",
    month: locale === "en" ? "short" : "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(date: string | Date, locale?: string): string {
  const loc = locale === "en" ? "en-US" : "ko-KR";
  return new Date(date).toLocaleString(loc, {
    year: "numeric",
    month: locale === "en" ? "short" : "long",
    day: "numeric",
  });
}

export function formatDateTimeFull(date: string | Date, locale?: string): string {
  const loc = locale === "en" ? "en-US" : "ko-KR";
  return new Date(date).toLocaleString(loc, {
    year: "numeric",
    month: locale === "en" ? "short" : "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
