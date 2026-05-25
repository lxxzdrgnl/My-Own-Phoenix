"use client";

import { useState, useCallback } from "react";
import { ShieldCheck, Play, Clock, BarChart3 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/api-client";
import type { PIIDetection, PiiGuardResult } from "@/lib/pii-guard";
import { useProject } from "@/lib/project-context";
import { PiiGuardPastRuns } from "./pii-guard-past-runs";
import { EvalDashboard } from "../eval-dashboard/eval-dashboard";
import { Heading, Text } from "@/components/ui/typography";
import { Stack } from "@/components/ui/stack";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingButton } from "@/components/ui/loading-button";

const DEFAULT_INPUT =
  "안녕하세요. 김민수입니다. 주민등록번호는 901225-1234567이고 연락처는 010-1234-5678 입니다. 신한은행 110-123-456789로 입금 부탁드려요.";

const DATASETS = [
  { value: "baseline", label: "Baseline (100)" },
  { value: "finance", label: "Finance (170)" },
  { value: "all", label: "All" },
];

const TYPE_LABELS: Record<string, string> = {
  rrn: "주민등록번호",
  bank_acct: "계좌번호",
  phone_kr: "전화번호",
  credit_card: "카드번호",
  email: "이메일",
  demographic: "인구통계",
  name: "이름",
  address: "주소",
};

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  rrn: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800" },
  bank_acct: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", border: "border-green-200 dark:border-green-800" },
  phone_kr: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" },
  credit_card: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800" },
  email: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
  demographic: { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-300", border: "border-pink-200 dark:border-pink-800" },
  name: { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-800" },
  address: { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-700 dark:text-teal-300", border: "border-teal-200 dark:border-teal-800" },
};

const HIGHLIGHT_COLORS: Record<string, string> = {
  rrn: "bg-red-200/70 dark:bg-red-800/40 text-red-900 dark:text-red-100",
  bank_acct: "bg-green-200/70 dark:bg-green-800/40 text-green-900 dark:text-green-100",
  phone_kr: "bg-blue-200/70 dark:bg-blue-800/40 text-blue-900 dark:text-blue-100",
  credit_card: "bg-purple-200/70 dark:bg-purple-800/40 text-purple-900 dark:text-purple-100",
  email: "bg-amber-200/70 dark:bg-amber-800/40 text-amber-900 dark:text-amber-100",
  demographic: "bg-pink-200/70 dark:bg-pink-800/40 text-pink-900 dark:text-pink-100",
  name: "bg-indigo-200/70 dark:bg-indigo-800/40 text-indigo-900 dark:text-indigo-100",
  address: "bg-teal-200/70 dark:bg-teal-800/40 text-teal-900 dark:text-teal-100",
};

type TabType = "live" | "past" | "dashboard";

export function PiiGuardRunner() {
  const { id: projectId } = useProject();
  const [tab, setTab] = useState<TabType>("live");
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [direction, setDirection] = useState<"input" | "output">("input");
  const [stage2, setStage2] = useState<"auto" | "force" | "skip">("auto");
  const [dataset, setDataset] = useState("baseline");
  const [sampleMode, setSampleMode] = useState("100");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PiiGuardResult | null>(null);

  const handleRun = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/pii-guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, direction, stage2, projectId }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [input, direction, stage2, projectId]);

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-2 border-b px-5 py-2.5">
        {(
          [
            { key: "live", label: "Live runner", icon: Play },
            { key: "past", label: "Past runs", icon: Clock },
            { key: "dashboard", label: "Dashboard", icon: BarChart3 },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "past" ? (
        <PiiGuardPastRuns />
      ) : tab === "dashboard" ? (
        <EvalDashboard />
      ) : (
        <Stack gap="lg" className="flex-1 overflow-y-auto px-8 py-6">
          {/* Header */}
          <div>
            <Heading level="page" className="flex items-center gap-2.5">
              <ShieldCheck className="h-6 w-6 text-primary" />
              PII 3-Stage Guard
            </Heading>
            <Text variant="caption" className="mt-1.5">
              Stage 1 (regex + Luhn) → Stage 1.5 (한국어 숫자/역순/인구통계 정규화) → Stage 2 (LLM 컨텍스트 판정). Dexter 백엔드의 가드를 실시간으로 호출합니다.
            </Text>
          </div>

          {/* Input section */}
          <SectionCard title="입력" variant="bordered">
            <Stack gap="sm">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={4}
                placeholder="PII를 포함한 텍스트를 입력하세요..."
                className="text-sm resize-y"
              />

              {/* Controls row */}
              <div className="flex flex-wrap items-center gap-4">
                <ControlSelect
                  label="방향"
                  value={direction}
                  onChange={(v) => setDirection(v as "input" | "output")}
                  options={[
                    { value: "input", label: "입력 가드" },
                    { value: "output", label: "출력 가드" },
                  ]}
                />
                <ControlSelect
                  label="Stage 2"
                  value={stage2}
                  onChange={(v) => setStage2(v as "auto" | "force" | "skip")}
                  options={[
                    { value: "auto", label: "auto" },
                    { value: "force", label: "force" },
                    { value: "skip", label: "skip" },
                  ]}
                />
                <ControlSelect
                  label="데이터셋"
                  value={dataset}
                  onChange={setDataset}
                  options={DATASETS.map((d) => ({ value: d.value, label: d.label }))}
                />
                <ControlSelect
                  label="샘플 로드"
                  value={sampleMode}
                  onChange={setSampleMode}
                  options={[
                    { value: "100", label: "100개에서 가져오기" },
                    { value: "50", label: "50개에서 가져오기" },
                    { value: "10", label: "10개에서 가져오기" },
                  ]}
                />

                <LoadingButton
                  onClick={handleRun}
                  disabled={!input.trim()}
                  loading={loading}
                  loadingText="실행 중..."
                  className="ml-auto gap-1.5 rounded-lg px-5"
                >
                  <Play className="h-3.5 w-3.5" />
                  Run guard
                </LoadingButton>
              </div>
            </Stack>
          </SectionCard>

          {loading && <LoadingState />}

          {result && !loading && <GuardResults result={result} originalText={input} />}
        </Stack>
      )}
    </div>
  );
}

// ─── Control select ───

function ControlSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-background px-3 py-1.5 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Results display ───

function GuardResults({ result, originalText }: { result: PiiGuardResult; originalText: string }) {
  const stage1 = result.stageDetections.stage1;
  const deterministic = result.stageDetections.deterministic;
  const stage2 = result.stageDetections.stage2;

  return (
    <Stack gap="md">
      {/* Detected original + Masked output side by side */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 탐지된 원문 */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Heading level="section" as="h3">탐지된 원문</Heading>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              result.action === "mask"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                : result.action === "block"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            }`}>
              action: {result.action}
            </span>
          </div>
          <div className="rounded-lg bg-muted/40 p-4 text-sm leading-7">
            <HighlightedText text={originalText} detections={result.detections} />
          </div>
        </div>

        {/* 마스킹된 출력 */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <Heading level="section" as="h3" className="flex items-center gap-1.5">
            &#x2728; 마스킹된 출력
          </Heading>
          <div className="rounded-lg bg-muted/40 p-4 text-sm leading-7 whitespace-pre-wrap">
            {result.maskedText}
          </div>
        </div>
      </div>

      {/* Stage별 탐지 */}
      <SectionCard title="Stage별 탐지" variant="bordered">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StageCard
            title="STAGE 1 · REGEX"
            color="text-red-500"
            hits={stage1.length}
            detections={stage1}
          />
          <StageCard
            title="STAGE 1.5 · NORMALIZER"
            color="text-amber-500"
            hits={deterministic.length}
            detections={deterministic}
          />
          <StageCard
            title="STAGE 2 · LLM"
            color="text-blue-500"
            hits={stage2.length}
            detections={stage2}
          />
        </div>
      </SectionCard>
    </Stack>
  );
}

// ─── Stage card ───

function StageCard({
  title,
  color,
  hits,
  detections,
}: {
  title: string;
  color: string;
  hits: number;
  detections: PIIDetection[];
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>{title}</span>
        <span className="text-xs text-muted-foreground">{hits} hits</span>
      </div>
      {detections.length === 0 ? (
        <Text variant="caption">탐지 없음</Text>
      ) : (
        <div className="space-y-2">
          {detections.map((d, i) => {
            const c = TYPE_COLORS[d.type] ?? { bg: "bg-muted", text: "text-foreground", border: "border-muted" };
            return (
              <div key={i} className="flex items-center gap-2.5">
                <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${c.bg} ${c.text} ${c.border}`}>
                  {TYPE_LABELS[d.type] ?? d.type}
                </span>
                <span className="font-mono text-sm flex-1 truncate">{d.match}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{d.confidence.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Highlighted text with PII marked ───

function HighlightedText({ text, detections }: { text: string; detections: PIIDetection[] }) {
  if (detections.length === 0) return <span>{text}</span>;

  const sorted = [...detections].sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  sorted.forEach((d, i) => {
    if (d.start > lastEnd) {
      parts.push(<span key={`t${i}`}>{text.slice(lastEnd, d.start)}</span>);
    }
    const hlColor = HIGHLIGHT_COLORS[d.type] ?? "bg-muted text-foreground";
    parts.push(
      <mark key={`d${i}`} className={`rounded-md px-1 py-0.5 font-medium ${hlColor}`}>
        {text.slice(d.start, d.end)}
      </mark>,
    );
    lastEnd = d.end;
  });

  if (lastEnd < text.length) {
    parts.push(<span key="end">{text.slice(lastEnd)}</span>);
  }

  return <>{parts}</>;
}

// ─── Past runs placeholder ───

function PastRunsPlaceholder() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center space-y-2">
        <Clock className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Past runs will appear here</p>
        <p className="text-xs text-muted-foreground/60">Run evaluations to see historical results</p>
      </div>
    </div>
  );
}
