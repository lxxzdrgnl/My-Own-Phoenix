"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { FileDown, ArrowLeft, Save, Trash2, Sparkles, Clock, Cpu, Coins, Filter, X } from "lucide-react";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { logger } from "@/lib/logger";
import { fetchSpansAndAnnotations, buildTraceTrees, type RawSpan, type Annotation, type TraceTree } from "@/lib/phoenix";
import { extractInputPreview, extractText } from "@/lib/span-extraction";
import { computeMetrics } from "@/lib/rmf-utils";
import type { AnnotationData } from "@/lib/dashboard-utils";
import { DateRangePicker, getPresetRange, type DateRange } from "@/components/ui/date-range-picker";
import { Heading, Text } from "@/components/ui/typography";
import { Stack, Inline } from "@/components/ui/stack";
import { SectionCard } from "@/components/ui/section-card";
import { ModalShell, ModalHeader } from "@/components/ui/modal-shell";
import { LoadingState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/dashboard/widgets/stat-card";
import { AnnotationBadge, AnnotationBadges } from "@/components/annotation-badge";
import { formatSec } from "@/components/trace-tree/span-tree-helpers";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ModelSelector } from "@/components/model-selector";
import { RISK_SECTIONS, GOVERNANCE_ITEMS, CONTROL_ITEMS } from "@/lib/rmf/finance-rmf";
import { prefillRiskItems, extractFindings, applyRiskOverrides, type RiskOverride } from "@/lib/rmf/finance-prefill";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import { useT } from "@/lib/i18n";
import { computeFinanceRisk } from "@/lib/rmf/finance-score";
import type { AssessmentState, Finding, Grade, ScoreResult, ChecklistItemState, ChecklistStatus } from "@/lib/rmf/types";
import { RmfBody } from "./rmf-report-body";
import {
  GRADES, GRADE_RANGE, gradeColor, gradeText, ratioColor, ratioLabel, metricLabel,
  sectionLabel, itemText, govText, ctrlText, checkStatusLabel, CHECK_STATUS_VALUES,
  SourceBadge, SECTION_DEFS, PRINT_CSS, parseFeedback, collectSpans,
  type SectionKey, type RmfFeedback,
} from "./rmf-helpers";

export function RmfReportView() {
  const { phoenixProject, id: projectId } = useProject();
  const t = useT();
  const rmf = t.rmf;
  const ui = rmf.ui;
  const nFindings = (n: number) => ui.findingsN.replace("{n}", String(n));
  const [loading, setLoading] = useState(true);
  const [annMap, setAnnMap] = useState<Record<string, Annotation[]>>({});
  const [trees, setTrees] = useState<TraceTree[]>([]);
  const [hasProvider, setHasProvider] = useState(false);

  const [mode, setMode] = useState<"config" | "preview">("config");
  const [tab, setTab] = useState<"dashboard" | "input" | "output">("dashboard");
  // 수동 평가(영속) — 고위험 여부·근거 + 위험항목 override(경감·미측정 인식·메모)
  const [highImpact, setHighImpact] = useState(false);
  const [hiReason, setHiReason] = useState("");
  const [overrides, setOverrides] = useState<Record<string, RiskOverride>>({});
  const [governance, setGovernance] = useState<Record<string, ChecklistItemState>>({});
  const [controls, setControls] = useState<Record<string, ChecklistItemState>>({});
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange(30));
  const [orgName, setOrgName] = useState("");
  const [assessor, setAssessor] = useState("");
  const [findingsCap, setFindingsCap] = useState(8);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const tracesRef = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    sectionDetail: true, findings: true, governance: true, controls: true, methodology: true,
  });
  const generatedAt = useMemo(() => new Date(), []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { allSpans, annMap } = await fetchSpansAndAnnotations(
          phoenixProject, dateRange.from?.toISOString(), dateRange.to?.toISOString(), undefined, 1000,
        );
        if (!active) return;
        setAnnMap(annMap);
        setTrees(buildTraceTrees(allSpans, annMap));
      } catch (e) { logger.error("rmf-report load failed", e); }
      try {
        if (projectId) {
          const r = await apiFetch(`/api/projects/${projectId}/providers`);
          if (r.ok) { const d = await r.json(); const list = d.items ?? d.providers ?? []; if (active) setHasProvider(list.some((p: { isActive?: boolean }) => p.isActive)); }
        }
      } catch { /* ignore */ }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [phoenixProject, projectId, dateRange]);

  const metrics = useMemo(() => {
    if (!trees.length) return computeMetrics([], []);
    const spanData = trees.flatMap((t) => { const s = collectSpans(t.rootSpan); s[0].time = t.time; return s; });
    const annData: AnnotationData[] = trees.flatMap((t) => t.rootSpan.annotations.map((a) => ({ ...a, time: t.time })));
    return computeMetrics(spanData, annData);
  }, [trees]);
  const metricById = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);

  const state: AssessmentState = useMemo(() => ({
    highImpact,
    riskItems: applyRiskOverrides(prefillRiskItems(metrics, hasProvider), overrides),
    governance, controls,
  }), [metrics, hasProvider, overrides, highImpact, governance, controls]);

  // 저장된 수동 평가 로드
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/projects/${projectId}/rmf-assessment`);
        if (!r.ok || !active) return;
        const d = await r.json();
        setHighImpact(!!d.highImpact);
        setOverrides((d.riskItems ?? {}) as Record<string, RiskOverride>);
        setGovernance((d.governance ?? {}) as Record<string, ChecklistItemState>);
        setControls((d.controls ?? {}) as Record<string, ChecklistItemState>);
        setHiReason(((d.notes ?? {}) as { highImpactReason?: string }).highImpactReason ?? "");
        const fb = d.feedback as { data?: RmfFeedback; model?: string; at?: string } | null;
        if (fb?.data) { setRecs(fb.data); setRecsAt(fb.at ?? ""); if (fb.model) setFbModel(fb.model); }
      } catch (e) { logger.error("rmf-assessment load failed", e); }
    })();
    return () => { active = false; };
  }, [projectId]);

  const [savedTick, setSavedTick] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const { submit: submitAssessment, saving: savingAssessment } = useFormSubmit(`/api/projects/${projectId}/rmf-assessment`, "PUT");
  const saveAssessment = useCallback(async () => {
    const ok = await submitAssessment({ highImpact, riskItems: overrides, governance, controls, notes: { highImpactReason: hiReason }, assessor });
    if (ok) { setSavedTick(true); setShowSaved(true); }
    return ok;
  }, [submitAssessment, highImpact, overrides, governance, controls, hiReason, assessor]);
  useEffect(() => { setSavedTick(false); }, [highImpact, hiReason, overrides, governance, controls]);

  const setChecklist = useCallback((kind: "gov" | "ctrl", key: string, patch: Partial<ChecklistItemState>) => {
    const setter = kind === "gov" ? setGovernance : setControls;
    setter((prev) => {
      const cur = prev[key] ?? { status: "done" as ChecklistStatus };
      const next: ChecklistItemState = { ...cur, ...patch };
      if (!next.note) delete next.note;
      return { ...prev, [key]: next };
    });
  }, []);

  const setOverride = useCallback((key: string, patch: Partial<RiskOverride>) => {
    setOverrides((prev) => {
      const next = { ...(prev[key] ?? {}), ...patch };
      // 빈 값 정리: undefined/NaN/"" 제거
      (Object.keys(next) as (keyof RiskOverride)[]).forEach((k) => {
        const v = next[k];
        if (v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v))) delete next[k];
      });
      return { ...prev, [key]: next };
    });
  }, []);

  const score = useMemo(() => computeFinanceRisk(state), [state]);
  const qualProgress = useMemo(() => {
    const items = RISK_SECTIONS.flatMap((s) => s.items).filter((it) => state.riskItems[it.key]?.source !== "eval");
    let filled = 0;
    for (const it of items) if ((overrides[it.key]?.note ?? "").trim()) filled++;
    for (const g of GOVERNANCE_ITEMS) if ((governance[g.key]?.note ?? "").trim()) filled++;
    for (const c of CONTROL_ITEMS) if ((controls[c.key]?.note ?? "").trim()) filled++;
    return { filled, total: items.length + GOVERNANCE_ITEMS.length + CONTROL_ITEMS.length };
  }, [state.riskItems, overrides, governance, controls]);
  const findings = useMemo(() => extractFindings(annMap), [annMap]);
  const findingsByItem = useMemo(() => {
    const m: Record<string, Finding[]> = {};
    for (const f of findings) (m[f.itemKey] ??= []).push(f);
    return m;
  }, [findings]);
  const findingsByEval = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of findings) m[f.eval] = (m[f.eval] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [findings]);
  const spanToTrace = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trees) { const walk = (n: RawSpan) => { m.set(n.spanId, t.traceId); n.children.forEach(walk); }; walk(t.rootSpan); }
    return m;
  }, [trees]);
  const traceQuery = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trees) m.set(t.traceId, extractInputPreview(t.rootSpan.input) || "");
    return m;
  }, [trees]);
  const findingQuery = (f: Finding) => traceQuery.get(spanToTrace.get(f.spanId) ?? "") ?? "";
  const fmtDate = (d?: Date) => (d ? d.toISOString().slice(0, 10) : "-");

  // 문제되는 트레이스 — 지적이 있는 트레이스 묶음 (지적 많은 순)
  const problematicTraces = useMemo(() => {
    const treeById = new Map(trees.map((t) => [t.traceId, t]));
    const byTrace = new Map<string, Finding[]>();
    for (const f of findings) {
      const tid = spanToTrace.get(f.spanId);
      if (!tid) continue;
      const arr = byTrace.get(tid) ?? [];
      arr.push(f);
      byTrace.set(tid, arr);
    }
    return [...byTrace.entries()]
      .map(([tid, fs]) => ({ tree: treeById.get(tid), findings: fs }))
      .filter((x): x is { tree: TraceTree; findings: Finding[] } => !!x.tree)
      .sort((a, b) => b.findings.length - a.findings.length);
  }, [findings, trees, spanToTrace]);

  // 선택된 위험항목으로 필터: 해당 항목 지적이 있는 트레이스만, 지적 사유도 그 항목으로 한정
  const shownTraces = useMemo(() => {
    if (!selectedItem) return problematicTraces;
    return problematicTraces
      .map(({ tree, findings: fs }) => ({ tree, findings: fs.filter((f) => f.itemKey === selectedItem) }))
      .filter((x) => x.findings.length > 0);
  }, [problematicTraces, selectedItem]);

  const selectItem = useCallback((key: string) => {
    setSelectedItem((cur) => {
      const next = cur === key ? null : key;
      if (next) requestAnimationFrame(() => tracesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return next;
    });
  }, []);

  // ── 보고서 저장 / 버전 ──
  const [versions, setVersions] = useState<Array<{ id: string; version: number; label: string | null; grade: string; total: number; createdAt: string; snapshot: any }>>([]);
  const [saving, setSaving] = useState(false);
  const [viewSnap, setViewSnap] = useState<{ version: number; snapshot: any } | null>(null);

  const loadVersions = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await apiFetch(`/api/projects/${projectId}/rmf-versions`);
      if (r.ok) { const d = await r.json(); setVersions(d.items ?? []); }
    } catch (e) { logger.error("rmf load versions failed", e); }
  }, [projectId]);
  useEffect(() => { loadVersions(); }, [loadVersions]);

  async function saveVersion() {
    if (!projectId) return;
    setSaving(true);
    try {
      const snapshot = { score, riskItems: state.riskItems, governance, controls, findingsByItem, traceCount: trees.length, sections, orgName, assessor, highImpact, hiReason, periodFrom: dateRange.from?.toISOString(), periodTo: dateRange.to?.toISOString() };
      const r = await apiFetch(`/api/projects/${projectId}/rmf-versions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade: score.grade, total: score.total, label: orgName || null, assessor, periodFrom: snapshot.periodFrom, periodTo: snapshot.periodTo, snapshot }),
      });
      if (r.ok) await loadVersions();
      else logger.error("rmf save version non-ok", undefined, { status: r.status });
    } catch (e) { logger.error("rmf save version failed", e); }
    setSaving(false);
  }

  async function deleteVersion(id: string) {
    if (!projectId) return;
    if (typeof window !== "undefined" && !window.confirm(ui.deleteVersionConfirm)) return;
    try {
      await apiFetch(`/api/projects/${projectId}/rmf-versions/${id}`, { method: "DELETE" });
      await loadVersions();
    } catch (e) { logger.error("rmf delete version failed", e); }
  }

  // ── AI 종합 피드백 (LLM, JSON 구조) ──
  const [recs, setRecs] = useState<RmfFeedback | null>(null);
  const [recsAt, setRecsAt] = useState("");
  const [recsError, setRecsError] = useState("");
  const [recsWarn, setRecsWarn] = useState("");
  const [recsLoading, setRecsLoading] = useState(false);
  const [fbModel, setFbModel] = useState("gpt-4o-mini");
  async function generateRecommendations() {
    if (!projectId) return;
    setRecsLoading(true);
    setRecsError("");
    try {
      const lines: string[] = [
        `대상 서비스(에이전트): ${phoenixProject}`,
        `종합 위험등급: ${score.grade}위험 (잔여위험 총점 ${score.total}/100)`,
        "부문별 잔여위험(소계/만점):",
        ...RISK_SECTIONS.map((sec) => `- ${sec.label}: ${score.sectionSubtotals[sec.key] ?? 0}/${sec.weight}`),
        `주요 지적사항(${findings.length}건 중 상위):`,
        ...findings.slice(0, 25).map((f) => `- [${itemText(f.itemKey, rmf).label}] ${f.eval}: ${f.reason || f.label}`),
      ];
      const sys = [
        "당신은 금융 AI 위험관리(금융감독원 AI RMF) 전문가입니다.",
        "아래 평가 결과를 바탕으로 '이 AI 에이전트를 어떻게 개선할지'에 초점을 둔 한국어 종합 피드백을 작성하세요.",
        "반드시 아래 JSON 객체 하나만 출력하세요. 코드펜스·설명·여는말 금지.",
        '{"summary":"현재 위험수준·핵심 문제 총평 2~3문장","risks":[{"area":"부문/항목명","detail":"왜 위험한지 1문장"}],"improvements":[{"area":"부문/항목명","action":"에이전트를 무엇을 바꿀지(프롬프트·가드레일·필터·데이터·휴먼리뷰 등 구체적 조치)","why":"어떤 위험을 줄이는지","how":"실제 적용 방법 1~2문장"}]}',
        "improvements는 위험이 높은 부문·항목 우선으로 3~6개, 에이전트 개선 관점에서 실행가능하게 작성하세요.",
      ].join("\n");
      const r = await apiFetch("/api/llm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: fbModel, projectId, promptLabel: "rmf-improvement", temperature: 0.3,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: lines.join("\n") },
          ],
        }),
      });
      if (!r.ok) { setRecsError(ui.genFailKey); return; }
      const d = await r.json();
      const parsed = parseFeedback(d.choices?.[0]?.message?.content ?? "");
      if (!parsed) { setRecsError(ui.genFailParse); return; }
      const at = new Date().toISOString();
      setRecs(parsed);
      setRecsWarn("");
      // 자동 저장(영속) — 성공해야 날짜 표시, 실패 시 경고 노출(조용히 묻히지 않게)
      try {
        const sr = await apiFetch(`/api/projects/${projectId}/rmf-assessment`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback: { data: parsed, model: fbModel, at } }),
        });
        if (sr.ok) { setRecsAt(at); }
        else { setRecsAt(""); setRecsWarn(ui.saveFailHttp.replace("{status}", String(sr.status))); logger.error("rmf feedback save non-ok", undefined, { status: sr.status }); }
      } catch (e) {
        setRecsAt(""); setRecsWarn(ui.saveFailNet); logger.error("rmf feedback save failed", e);
      }
    } catch (e) { logger.error("rmf recommendations failed", e); setRecsError(ui.genFail); }
    finally { setRecsLoading(false); }
  }

  // 문서 렌더 소스: 저장본(viewSnap) 보기 중이면 그 스냅샷, 아니면 라이브
  const snap = viewSnap?.snapshot ?? null;
  const dScore: ScoreResult = snap ? snap.score : score;
  const dState: AssessmentState = snap ? { highImpact: !!snap.highImpact, riskItems: snap.riskItems, governance: snap.governance ?? {}, controls: snap.controls ?? {} } : state;
  const dMetricById = (snap ? new Map() : metricById) as typeof metricById;
  const dFindingsByItem: Record<string, Finding[]> = snap ? snap.findingsByItem : findingsByItem;
  const dFindingQuery = snap ? () => "" : findingQuery;
  const dTraceCount: number = snap ? snap.traceCount : trees.length;
  const dSections: Record<SectionKey, boolean> = snap ? snap.sections : sections;
  const dOrg: string = snap ? (snap.orgName ?? "") : orgName;
  const dAssessor: string = snap ? (snap.assessor ?? "") : assessor;
  const dFrom = snap ? (snap.periodFrom ? new Date(snap.periodFrom) : undefined) : dateRange.from;
  const dTo = snap ? (snap.periodTo ? new Date(snap.periodTo) : undefined) : dateRange.to;
  const dHighImpact: boolean = snap ? !!snap.highImpact : highImpact;
  const dHiReason: string = snap ? (snap.hiReason ?? "") : hiReason;

  const body = (
    <RmfBody score={dScore} state={dState} metricById={dMetricById} findingsByItem={dFindingsByItem}
      findingQuery={dFindingQuery} traceCount={dTraceCount} sections={dSections} findingsCap={findingsCap} />
  );

  // ─── 대시보드 단계 (앱 스타일 — human-review 참고) ───
  if (mode === "config") {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-5xl">
          <Inline gap="sm" className="mb-5 justify-between flex-wrap" align="start">
            <Stack gap="xs">
              <Heading level="page" as="h1" className="text-xl">{ui.pageTitle}</Heading>
              <Text variant="caption" as="p">{phoenixProject} · {ui.subtitleSuffix}</Text>
            </Stack>
          </Inline>

          <div className="mb-5 flex gap-5 border-b">
            {([["dashboard", ui.tabDashboard], ["input", ui.tabInput], ["output", ui.tabOutput]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-1 py-2 text-sm font-medium transition-colors ${tab === k ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>
            ))}
          </div>

          {loading ? <LoadingState /> : tab === "dashboard" ? (
            <Stack gap="lg">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="h-28 rounded-xl border bg-card"><StatCard value={gradeText(score.grade, rmf)} label={ui.overallGrade} /></div>
                <div className="h-28 rounded-xl border bg-card"><StatCard value={String(score.total)} label={ui.residualTotal} trend="/ 100" /></div>
                <div className="h-28 rounded-xl border bg-card"><StatCard value={String(trees.length)} label={ui.tracesAnalyzed} /></div>
                <div className="h-28 rounded-xl border bg-card"><StatCard value={String(findings.length)} label={ui.findingsStat} /></div>
              </div>

              <div className="flex overflow-hidden rounded-lg border text-center text-xs">
                {GRADES.map((g) => (
                  <div key={g} className="flex-1 py-2" style={{ background: g === score.grade ? gradeColor(g) : "transparent", color: g === score.grade ? "#fff" : undefined, fontWeight: g === score.grade ? 600 : 400 }}>{gradeText(g, rmf)} <span className="tabular-nums">({GRADE_RANGE[g]})</span></div>
                ))}
              </div>

              <SectionCard title={ui.aiFeedback} description={ui.aiFeedbackDesc} variant="bordered" actions={
                <Inline gap="sm">
                  {recsAt && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{new Date(recsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} {ui.savedAt}</span>}
                  {recsWarn && <span className="text-xs" style={{ color: "#ef4444" }}>{recsWarn}</span>}
                  <div className="w-44"><ModelSelector value={fbModel} onChange={setFbModel} /></div>
                  <button onClick={generateRecommendations} disabled={recsLoading} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-40"><Sparkles className="h-3.5 w-3.5" /> {recsLoading ? ui.generating : recs ? ui.regenerate : ui.generateFeedback}</button>
                </Inline>
              }>
                {recs ? (
                  <Stack gap="md">
                    <div>
                      <Text variant="caption" className="font-medium text-foreground">{ui.summary}</Text>
                      <Text variant="caption" as="p" className="mt-1 leading-relaxed text-foreground/80">{recs.summary || "—"}</Text>
                    </div>
                    {recs.risks.length > 0 && (
                      <div>
                        <Text variant="caption" className="font-medium text-foreground">{ui.keyRisks}</Text>
                        <ul className="mt-1 space-y-1">
                          {recs.risks.map((rk, i) => (
                            <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/80">
                              <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full" style={{ background: "#ef4444" }} />
                              <span><span className="font-medium text-foreground">{rk.area}</span> — {rk.detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {recs.improvements.length > 0 && (
                      <div>
                        <Text variant="caption" className="font-medium text-foreground">{ui.agentImprovements}</Text>
                        <ol className="mt-1.5 space-y-2">
                          {recs.improvements.map((im, i) => (
                            <li key={i} className="rounded-md border bg-muted/30 p-2.5">
                              <Text variant="caption" className="font-medium text-foreground">{i + 1}. {im.action}</Text>
                              {im.area && <span className="ml-1.5 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] text-foreground/70">{im.area}</span>}
                              {im.why && <Text variant="caption" as="p" className="mt-1 text-foreground/70">{ui.why} — {im.why}</Text>}
                              {im.how && <Text variant="caption" as="p" className="text-foreground/70">{ui.how} — {im.how}</Text>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </Stack>
                ) : recsError
                  ? <p className="text-sm" style={{ color: "#ef4444" }}>{recsError}</p>
                  : <Text variant="caption" as="p">{ui.feedbackPlaceholderA}<b className="text-foreground">{ui.feedbackPlaceholderB}</b>{ui.feedbackPlaceholderC}</Text>}
              </SectionCard>

              <Text variant="caption" as="p" className="rounded-lg border bg-muted/40 p-3 leading-relaxed">
                <b className="text-foreground">{ui.methodTitle}</b> — {ui.methodBody} <span style={{ color: "#10b981" }}>{ui.methodSafe}</span> ~ <span style={{ color: "#ef4444" }}>{ui.methodRisk}</span>.
              </Text>

              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title={ui.sectionRisk} variant="bordered">
                  <Stack gap="sm">
                    {RISK_SECTIONS.map((sec) => {
                      const sub = score.sectionSubtotals[sec.key] ?? 0;
                      const ratio = sec.weight > 0 ? sub / sec.weight : 0;
                      const pct = Math.min(100, Math.round(ratio * 100));
                      const color = ratioColor(ratio);
                      return (
                        <div key={sec.key} className="flex items-center gap-3 text-xs">
                          <div className="w-24 shrink-0 font-medium">{sectionLabel(sec.key, rmf)} <span className="text-muted-foreground">({sec.weight}%)</span></div>
                          <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: color }} /></div>
                          <div className="w-24 shrink-0 text-right"><span className="font-medium" style={{ color }}>{ratioLabel(ratio, rmf.levels)}</span><span className="tabular-nums text-muted-foreground"> · {sub}/{sec.weight}</span></div>
                        </div>
                      );
                    })}
                  </Stack>
                </SectionCard>
                <SectionCard title={ui.findingDistribution} description={ui.findingDistributionDesc} variant="bordered">
                  {findingsByEval.length === 0 ? (
                    <Text variant="caption" as="p">{ui.noFindings}</Text>
                  ) : (
                    <Stack gap="xs">
                      {findingsByEval.map(([name, count]) => {
                        const max = findingsByEval[0][1] || 1;
                        return (
                          <div key={name} className="flex items-center gap-2 text-xs">
                            <div className="w-36 shrink-0 font-mono text-xs">{name}</div>
                            <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted"><div className="h-full rounded bg-foreground/80" style={{ width: Math.round((count / max) * 100) + "%" }} /></div>
                            <div className="w-8 shrink-0 text-right tabular-nums">{count}</div>
                          </div>
                        );
                      })}
                    </Stack>
                  )}
                </SectionCard>
              </div>

              <SectionCard title={ui.riskItems} description={ui.riskItemsDesc} variant="bordered">
                <Stack gap="md">
                  {RISK_SECTIONS.map((sec) => {
                    const sub = score.sectionSubtotals[sec.key] ?? 0;
                    const sratio = sec.weight > 0 ? sub / sec.weight : 0;
                    const sfc = sec.items.reduce((a, it) => a + (findingsByItem[it.key]?.length ?? 0), 0);
                    return (
                      <div key={sec.key}>
                        <div className="mb-2 flex items-baseline justify-between gap-2 border-b pb-1.5">
                          <Text variant="body" as="p" className="font-medium">{sectionLabel(sec.key, rmf)}<span className="ml-1.5 text-xs text-muted-foreground">{ui.weight} {sec.weight}%</span></Text>
                          <Text variant="caption" as="span" className="tabular-nums"><span className="font-medium" style={{ color: ratioColor(sratio) }}>{ratioLabel(sratio, rmf.levels)}</span> · {ui.subtotal} {sub}/{sec.weight}{sfc > 0 ? ` · ${nFindings(sfc)}` : ""}</Text>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {sec.items.map((item) => {
                            const st = state.riskItems[item.key];
                            const measured = !!st && st.source !== "manual";
                            const residual = score.perItemResidual[item.key] ?? 0;
                            const inherent = st?.inherent ?? 0;
                            const mitigation = st?.mitigation ?? 0;
                            const rr = item.maxInherent > 0 ? residual / item.maxInherent : 0;
                            const pct = Math.min(100, Math.round(rr * 100));
                            const fc = findingsByItem[item.key]?.length ?? 0;
                            const color = ratioColor(rr);
                            const selectable = fc > 0;
                            const isSelected = selectedItem === item.key;
                            const m = item.evalMetricId ? metricById.get(item.evalMetricId) : undefined;
                            const basis = item.providerSignal
                              ? ui.providerSignal
                              : m && !m.noData
                                ? `${metricLabel(item.evalMetricId)} ${m.value.toFixed(0)}%`
                                : ui.basisDefault;
                            const evalText = item.providerSignal
                              ? ui.providerSignalFull
                              : item.evalMetricId
                                ? `${metricLabel(item.evalMetricId)} (${item.evalMetricId})${m && !m.noData ? ` · ${ui.measuredValue} ${m.value.toFixed(0)}%` : ` · ${ui.noData}`}`
                                : ui.noEvalData;
                            return (
                              <Tooltip key={item.key}>
                                <TooltipTrigger asChild>
                                  <div
                                    onClick={selectable ? () => selectItem(item.key) : undefined}
                                    className={`flex flex-col gap-2 rounded-lg border bg-card p-3 transition-all duration-200 ${selectable ? "cursor-pointer hover:border-foreground/40" : "cursor-help hover:border-foreground/30"} ${isSelected ? "border-foreground bg-foreground/[0.04] ring-1 ring-foreground" : ""} ${selectedItem && !isSelected ? "opacity-45 hover:opacity-100" : ""}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="flex items-start gap-1.5 text-xs font-medium leading-tight"><span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: measured ? color : "#d4d4d8" }} />{itemText(item.key, rmf).label}</span>
                                      <SourceBadge source={st?.source} subtle />
                                    </div>
                                    {measured ? (
                                      <>
                                        <div className="flex items-baseline justify-between gap-1">
                                          <span className="flex items-baseline gap-1">
                                            <span className="text-base font-medium tabular-nums" style={{ color }}>{residual}</span>
                                            <Text variant="caption" as="span">/ {item.maxInherent} {ui.residual}</Text>
                                          </span>
                                          <span className="text-xs font-medium" style={{ color }}>{ratioLabel(rr, rmf.levels)}</span>
                                        </div>
                                        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: color }} /></div>
                                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                          <span className="min-w-0 truncate">{basis}</span>
                                          {fc > 0 && <span className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-medium text-foreground/70">{nFindings(fc)}</span>}
                                        </div>
                                      </>
                                    ) : (
                                      <Text variant="caption" as="span">{ui.notMeasured}</Text>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[280px]">
                                  <div className="space-y-1 leading-relaxed">
                                    <p className="font-medium">{itemText(item.key, rmf).label}</p>
                                    {measured ? (
                                      <>
                                        <p>{ui.inherent} {inherent} − {ui.mitigation} {mitigation} = <b>{ui.residual} {residual}</b> / {item.maxInherent} ({ratioLabel(rr, rmf.levels)})</p>
                                        <p className="opacity-80">{ui.basisEval}: {evalText}</p>
                                        <p className="opacity-80">{ui.scoringGuide}: {itemText(item.key, rmf).guide}</p>
                                        {fc > 0 && <p className="opacity-80">{ui.autoDetectedFindings} {fc}</p>}
                                      </>
                                    ) : (
                                      <p className="opacity-80">{ui.noAutoData}{item.evalMetricId ? ` (${ui.baseEval}: ${item.evalMetricId})` : ""}</p>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </Stack>
              </SectionCard>

              <div ref={tracesRef} className="scroll-mt-4" />
              <SectionCard
                title={ui.problematicTraces}
                description={selectedItem ? ui.relatedTraces.replace("{item}", itemText(selectedItem, rmf).label).replace("{n}", String(shownTraces.length)) : ui.problematicDesc.replace("{n}", String(problematicTraces.length))}
                variant="bordered"
              >
                {selectedItem && (
                  <div className="mb-3 flex items-center gap-2 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background delay-300 duration-500 fill-mode-backwards animate-in fade-in slide-in-from-top-2">
                    <Filter className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 truncate">{ui.filterLabel} <b>{itemText(selectedItem, rmf).label}</b> · {nFindings(shownTraces.length)}</span>
                    <button onClick={() => setSelectedItem(null)} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded border border-background/30 px-1.5 py-0.5 font-medium transition hover:bg-background/15"><X className="h-3 w-3" /> {ui.clearFilter}</button>
                  </div>
                )}
                {shownTraces.length === 0 ? (
                  <Text variant="caption" as="p">{selectedItem ? ui.noTracesForItem : ui.noProblematic}</Text>
                ) : (
                  <Stack key={selectedItem ?? "all"} gap="sm" className="delay-300 duration-700 fill-mode-backwards animate-in fade-in">
                    {shownTraces.slice(0, 15).map(({ tree, findings: tf }) => {
                      const root = tree.rootSpan;
                      const inp = extractText(root.input) || `(${ui.inputLabel})`;
                      const out = extractText(root.output) || `(${ui.outputLabel})`;
                      const hasHuman = tf.some((f) => f.annotatorKind === "HUMAN");
                      const isError = (root.status || "OK") !== "OK";
                      return (
                        <div key={tree.traceId} className="rounded-lg border p-3">
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Text variant="caption" as="p" className="font-medium uppercase tracking-wide text-foreground/70">{ui.trace}</Text>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatSec(tree.latency)}</span>
                                {root.model && <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{root.model}</span>}
                                {root.totalTokens > 0 && <span className="flex items-center gap-1"><Coins className="h-3 w-3" /><span className="tabular-nums">{root.totalTokens.toLocaleString()}</span> tok</span>}
                                <span className="tabular-nums">{new Date(tree.time).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                                <span className="rounded bg-muted px-1.5 py-0.5 tabular-nums">{tree.spanCount} span</span>
                                {isError && <span className="font-medium" style={{ color: "#ef4444" }}>ERROR</span>}
                              </div>
                            </div>
                            <span className="shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">{nFindings(tf.length)}{hasHuman ? ` · ${ui.humanEvalShort}` : ""}</span>
                          </div>
                          {root.annotations.length > 0 && (
                            <div className="mb-2"><AnnotationBadges annotations={root.annotations} includeHuman /></div>
                          )}
                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="rounded-md bg-muted/40 p-2">
                              <Text variant="caption" as="p" className="mb-1 font-medium text-foreground/70">{ui.inputLabel}</Text>
                              <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{inp}</p>
                            </div>
                            <div className="rounded-md bg-muted/40 p-2">
                              <Text variant="caption" as="p" className="mb-1 font-medium text-foreground/70">{ui.outputLabel}</Text>
                              <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{out}</p>
                            </div>
                          </div>
                          <div className="mt-2 border-t pt-2">
                            <Text variant="caption" as="p" className="mb-1.5 font-medium uppercase tracking-wide text-foreground/70">{ui.reasonsLabel} {tf.length}</Text>
                            <Stack gap="sm">
                              {tf.map((f, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <span className="mt-0.5 shrink-0"><AnnotationBadge annotation={{ name: f.eval, label: f.label, score: f.score, annotatorKind: f.annotatorKind === "HUMAN" ? "HUMAN" : "LLM", explanation: f.reason }} /></span>
                                  <Text variant="caption" as="p" className="min-w-0 flex-1"><span className="text-foreground/70">[{itemText(f.itemKey, rmf).label}]</span> {f.reason || f.label}</Text>
                                </div>
                              ))}
                            </Stack>
                          </div>
                        </div>
                      );
                    })}
                  </Stack>
                )}
              </SectionCard>

            </Stack>
          ) : tab === "input" ? (
            <Stack gap="lg" className="pb-24 duration-300 animate-in fade-in">
              <Text variant="caption" as="p" className="rounded-lg border bg-muted/40 p-3 leading-relaxed">
                {ui.inputIntroA}<b className="text-foreground">{ui.inputIntroB}</b>{ui.inputIntroC}<b className="text-foreground">{ui.inputIntroD}</b>{ui.inputIntroE}
              </Text>

              <SectionCard title={ui.highRiskTitle} description={ui.highRiskDesc} variant="bordered">
                <Stack gap="sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">{ui.highRiskQuestion}</span>
                    <div className="flex shrink-0 overflow-hidden rounded-md border text-xs">
                      {([[true, ui.yes], [false, ui.no]] as const).map(([v, label]) => (
                        <button key={label} onClick={() => setHighImpact(v)} className={`px-3 py-1.5 transition-colors ${highImpact === v ? "bg-foreground text-background" : "hover:bg-muted"}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                  {highImpact && <textarea value={hiReason} onChange={(e) => setHiReason(e.target.value)} placeholder={ui.highRiskReasonPh} rows={2} className="w-full rounded-md border bg-transparent px-3 py-2 text-sm duration-200 animate-in fade-in" />}
                </Stack>
              </SectionCard>

              <SectionCard title={ui.qualNeededTitle} description={ui.qualNeededDesc} variant="bordered">
                <Stack gap="md">
                  {(() => {
                    const blocks = RISK_SECTIONS
                      .map((sec) => ({ sec, items: sec.items.filter((it) => state.riskItems[it.key]?.source !== "eval") }))
                      .filter((b) => b.items.length > 0);
                    if (blocks.length === 0) return <Text variant="caption" as="p">{ui.noManualNeeded}</Text>;
                    return blocks.map(({ sec, items }) => (
                      <div key={sec.key}>
                        <Text variant="body" as="p" className="mb-2 border-b pb-1.5 font-medium">{sectionLabel(sec.key, rmf)} <span className="text-xs text-muted-foreground">{ui.weight} {sec.weight}%</span></Text>
                        <Stack gap="sm">
                          {items.map((item) => {
                            const st = state.riskItems[item.key];
                            const isProvider = st?.source === "provider";
                            const ov = overrides[item.key] ?? {};
                            const filled = !!(ov.note ?? "").trim();
                            return (
                              <div key={item.key} className={`rounded-lg border p-3 transition-colors ${filled ? "border-l-2 border-l-foreground" : ""}`}>
                                <Text variant="caption" as="p" className="font-medium text-foreground">{itemText(item.key, rmf).label}{isProvider && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{ui.providerDetected}</span>}</Text>
                                <p className="mb-2 mt-0.5 text-xs leading-relaxed text-muted-foreground">{ui.assessPerspective}: {itemText(item.key, rmf).guide}</p>
                                <textarea value={ov.note ?? ""} rows={2}
                                  placeholder={ui.qualItemPh}
                                  onChange={(e) => setOverride(item.key, { note: e.target.value || undefined })}
                                  className="w-full rounded border bg-transparent px-2 py-1.5 text-sm leading-relaxed" />
                              </div>
                            );
                          })}
                        </Stack>
                      </div>
                    ));
                  })()}
                </Stack>
              </SectionCard>

              <SectionCard title={ui.govTitle} description={ui.govDesc} variant="bordered">
                <Stack gap="sm">
                  {GOVERNANCE_ITEMS.map((g) => {
                    const cur = governance[g.key];
                    const filled = !!(cur?.note ?? "").trim();
                    return (
                      <div key={g.key} className={`rounded-lg border p-3 transition-colors ${filled ? "border-l-2 border-l-foreground" : ""}`}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Text variant="caption" as="p" className="font-medium text-foreground">{govText(g.key, rmf).label}</Text>
                            <p className="text-xs leading-relaxed text-muted-foreground">{govText(g.key, rmf).desc}</p>
                          </div>
                          <div className="flex shrink-0 overflow-hidden rounded-md border text-xs">
                            {CHECK_STATUS_VALUES.map((v) => {
                              const active = (cur?.status ?? "done") === v;
                              return <button key={v} onClick={() => setChecklist("gov", g.key, { status: v })} className={`px-2 py-1 transition-colors ${active ? "bg-foreground text-background" : "hover:bg-muted"}`}>{checkStatusLabel(v, rmf.statuses)}</button>;
                            })}
                          </div>
                        </div>
                        <textarea value={cur?.note ?? ""} rows={1} placeholder={ui.govNotePh} onChange={(e) => setChecklist("gov", g.key, { note: e.target.value })} className="w-full rounded border bg-transparent px-2 py-1.5 text-sm" />
                      </div>
                    );
                  })}
                </Stack>
              </SectionCard>

              <SectionCard title={ui.ctrlTitle} description={ui.ctrlDesc} variant="bordered">
                <Stack gap="sm">
                  {CONTROL_ITEMS.map((c) => {
                    const cur = controls[c.key];
                    const filled = !!(cur?.note ?? "").trim();
                    return (
                      <div key={c.key} className={`rounded-lg border p-3 transition-colors ${filled ? "border-l-2 border-l-foreground" : ""}`}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Text variant="caption" as="p" className="font-medium text-foreground">{ctrlText(c.key, rmf).label}{c.autoEvidenced && <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {ui.autoEvidenced}</span>}</Text>
                            <p className="text-xs leading-relaxed text-muted-foreground">{ctrlText(c.key, rmf).desc}</p>
                          </div>
                          <div className="flex shrink-0 overflow-hidden rounded-md border text-xs">
                            {CHECK_STATUS_VALUES.map((v) => {
                              const active = (cur?.status ?? "done") === v;
                              return <button key={v} onClick={() => setChecklist("ctrl", c.key, { status: v })} className={`px-2 py-1 transition-colors ${active ? "bg-foreground text-background" : "hover:bg-muted"}`}>{checkStatusLabel(v, rmf.statuses)}</button>;
                            })}
                          </div>
                        </div>
                        <textarea value={cur?.note ?? ""} rows={1} placeholder={ui.ctrlNotePh} onChange={(e) => setChecklist("ctrl", c.key, { note: e.target.value })} className="w-full rounded border bg-transparent px-2 py-1.5 text-sm" />
                      </div>
                    );
                  })}
                </Stack>
              </SectionCard>

              <div className="sticky bottom-0 z-10 -mx-6 flex items-center justify-between gap-3 border-t bg-background/90 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/75">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="tabular-nums">{ui.total} <b className="text-foreground">{score.total}</b>/100 · <span style={{ color: gradeColor(score.grade) }}>{gradeText(score.grade, rmf)}</span></span>
                  <span className="h-3 w-px bg-border" />
                  <span className="tabular-nums">{ui.qualInputProgress} <b className="text-foreground">{qualProgress.filled}</b>/{qualProgress.total}</span>
                  {savedTick && <span className="inline-flex items-center gap-1 duration-200 animate-in fade-in" style={{ color: "#10b981" }}>✓ {ui.saved}</span>}
                </div>
                <button onClick={() => void saveAssessment()} disabled={savingAssessment} className="flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/80 disabled:opacity-40"><Save className="h-4 w-4" /> {savingAssessment ? ui.saving : ui.saveAssessment}</button>
              </div>

              <ModalShell open={showSaved} onClose={() => setShowSaved(false)} size="sm">
                <ModalHeader title={ui.savedModalTitle} description={ui.savedModalDesc} />
                <div className="mt-3 flex justify-end">
                  <button onClick={() => setShowSaved(false)} className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/80">{ui.confirm}</button>
                </div>
              </ModalShell>
            </Stack>
          ) : (
            <Stack gap="lg">
              <SectionCard title={ui.reportForRegulator} description={ui.reportForRegulatorDesc.replace("{grade}", gradeText(score.grade, rmf)).replace("{total}", String(score.total)).replace("{n}", String(trees.length))} variant="bordered" actions={
                <button onClick={() => { setViewSnap(null); void saveVersion(); setMode("preview"); }} disabled={loading || saving} className="flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/80 disabled:opacity-40">
                  <FileDown className="h-4 w-4" /> {saving ? ui.generatingReport : ui.generateReport}
                </button>
              }>
                <Text variant="caption" as="p">{ui.outputHint}</Text>
              </SectionCard>

              <SectionCard title={ui.outputSettings} variant="bordered">
                <div className="grid grid-cols-1 gap-x-8 gap-y-3 text-xs md:grid-cols-2">
                  <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{ui.period}</span><DateRangePicker value={dateRange} onChange={setDateRange} /></label>
                  <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{ui.findingsPerItem}</span><input type="number" min={1} max={50} value={findingsCap} onChange={(e) => setFindingsCap(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="w-20 rounded border px-2 py-1 tabular-nums" /></label>
                  <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{ui.orgSubmitTo}</span><input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={ui.orgPh} className="w-44 rounded border px-2 py-1" /></label>
                  <label className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{ui.assessorLabel}</span><input value={assessor} onChange={(e) => setAssessor(e.target.value)} placeholder={ui.assessorPh} className="w-44 rounded border px-2 py-1" /></label>
                </div>
              </SectionCard>

              <SectionCard title={ui.includeSections} variant="bordered">
                <div className="flex flex-wrap gap-2 text-xs">
                  {SECTION_DEFS.map((s) => (
                    <label key={s.key} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 ${sections[s.key] ? "border-foreground" : ""}`}>
                      <input type="checkbox" checked={sections[s.key]} onChange={(e) => setSections((prev) => ({ ...prev, [s.key]: e.target.checked }))} className="rounded" />{ui[s.uiKey]}
                    </label>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title={ui.savedVersions} description={ui.savedVersionsDesc.replace("{n}", String(versions.length))} variant="bordered">
                {versions.length === 0 ? (
                  <Text variant="caption" as="p">{ui.noVersions}</Text>
                ) : (
                  <Stack gap="xs">
                    {versions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: gradeColor(v.grade as Grade) }}>{gradeText(v.grade as Grade, rmf)}</span>
                            <span className="font-medium tabular-nums">{v.total}{ui.points}</span>
                            <span className="text-muted-foreground">· {nFindings(Object.values((v.snapshot?.findingsByItem ?? {}) as Record<string, unknown[]>).reduce((a, arr) => a + (arr?.length ?? 0), 0))}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">v{v.version} · {new Date(v.createdAt).toLocaleString(undefined)}{v.label ? ` · ${v.label}` : ""}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button onClick={() => { setViewSnap({ version: v.version, snapshot: v.snapshot }); setMode("preview"); }} className="rounded-md border px-2.5 py-1 font-medium transition hover:bg-muted">{ui.view}</button>
                          <button onClick={() => deleteVersion(v.id)} className="rounded-md border p-1.5 text-muted-foreground transition hover:bg-muted" title={ui.delete}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </Stack>
                )}
              </SectionCard>
            </Stack>
          )}
        </div>
      </div>
    );
  }
  // ─── 문서(미리보기 + PDF) 단계 ───
  return (
    <div className="mx-auto max-w-[880px] p-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <button onClick={() => { setViewSnap(null); setMode("config"); }} className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition hover:bg-muted"><ArrowLeft className="h-4 w-4" /> {ui.backToDashboard}</button>
        <div className="flex items-center gap-2">
          {viewSnap && <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">{ui.viewingSnapshot.replace("{v}", String(viewSnap.version))}</span>}
          <button onClick={() => {
            const safe = String(phoenixProject || "report").replace(/[\\/:*?"<>|\s]+/g, "_");
            const prev = document.title;
            document.title = `RMF_${safe}_${fmtDate(generatedAt)}`;
            const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
            window.addEventListener("afterprint", restore);
            window.print();
          }} className="flex items-center gap-1.5 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:bg-foreground/80"><FileDown className="h-4 w-4" /> {ui.printPdf}</button>
        </div>
      </div>
      <div className="rmf-report rounded-lg border bg-white p-10 text-[13px] leading-relaxed text-neutral-900 shadow-sm">
        <div className="rmf-head mb-6 border-b-2 border-neutral-800 pb-4 text-center">
          <p className="text-[11px] tracking-wide text-neutral-500">{ui.reportFramework}{dOrg ? ` · ${ui.submitTo}: ${dOrg}` : ""}</p>
          <h1 className="mt-2 text-[22px] font-extrabold">{ui.reportTitle}</h1>
          <table className="mx-auto mt-4 text-[12px]">
            <tbody>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.targetService}</td><td className="px-3 py-0.5 text-left font-semibold">{phoenixProject}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.period}</td><td className="px-3 py-0.5 text-left">{fmtDate(dFrom)} ~ {fmtDate(dTo)}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.tracesAnalyzed}</td><td className="px-3 py-0.5 text-left">{dTraceCount}</td></tr>
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.highRiskRow}</td><td className="px-3 py-0.5 text-left">{dHighImpact ? <span className="font-semibold" style={{ color: "#ef4444" }}>{ui.applicable}{dHiReason ? ` — ${dHiReason}` : ""}</span> : ui.notApplicable}</td></tr>
              {dAssessor && <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.assessorLabel}</td><td className="px-3 py-0.5 text-left">{dAssessor}</td></tr>}
              <tr><td className="px-3 py-0.5 text-right text-neutral-500">{ui.generatedDate}</td><td className="px-3 py-0.5 text-left">{fmtDate(generatedAt)}</td></tr>
            </tbody>
          </table>
        </div>
        {body}
      </div>
    </div>
  );
}
