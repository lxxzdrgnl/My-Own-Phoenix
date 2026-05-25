"use client";

import { apiFetch } from "@/lib/api-client";
import { useCallback, useEffect, useState } from "react";
import { useProject, canEdit } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { RoleGate } from "@/components/ui/role-gate";
import {
  WidgetGrid,
  type WidgetConfig,
  type LayoutItem,
  type WidgetViewMode,
  type WidgetColors,
} from "@/components/dashboard/widget-grid";
import { AddWidgetMenu, WIDGET_GROUPS } from "@/components/dashboard/add-widget-menu";
import { DateRangePicker, getPresetRange, type DateRange } from "@/components/ui/date-range-picker";
import { type AnnotationData, type SpanData } from "@/lib/dashboard-utils";
import { getWidget } from "@/components/dashboard/widgets/registry";
import { LastUpdatedBadge } from "@/components/dashboard/last-updated-badge";
import { Heading } from "@/components/ui/typography";

// ─── Title sync & layout helpers ───

const CANONICAL_TITLES: Record<string, string> = Object.fromEntries(
  WIDGET_GROUPS.flatMap((g) => g.items.map((w) => [w.type, w.title])),
);

function fixWidgetTitles(widgets: WidgetConfig[]): WidgetConfig[] {
  return widgets.map((w) => {
    const canonical = CANONICAL_TITLES[w.type];
    return canonical && w.title !== canonical ? { ...w, title: canonical } : w;
  });
}

function fixLayoutMins(layouts: LayoutItem[], widgets: WidgetConfig[]): LayoutItem[] {
  return layouts.map((l) => {
    const widget = widgets.find((w) => w.id === l.i);
    if (!widget) return l;
    return { ...l, ...widgetMinSize(widget.type) };
  });
}

const LARGE_MIN_TYPES = new Set(["score_comparison", "annotation_scores"]);

const widgetMinSize = (type: string) =>
  LARGE_MIN_TYPES.has(type) ? { minW: 2, minH: 1 } : { minW: 1, minH: 1 };

function findBottomPosition(existing: LayoutItem[], _w: number, _h: number, _cols: number): { x: number; y: number } {
  if (existing.length === 0) return { x: 0, y: 0 };
  const bottom = Math.max(...existing.map((l) => l.y + l.h));
  return { x: 0, y: bottom };
}

// ─── Defaults ───

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "w1", type: "hallucination", title: "Hallucination Rate" },
  { id: "w2", type: "qa_correctness", title: "QA Correctness" },
  { id: "w3", type: "total_queries", title: "Total Queries" },
  { id: "w4", type: "avg_latency", title: "Avg Response Time" },
];

const DEFAULT_LAYOUTS: LayoutItem[] = [
  { i: "w1", x: 0, y: 0, w: 5, h: 3, minW: 1, minH: 1 },
  { i: "w2", x: 5, y: 0, w: 5, h: 3, minW: 1, minH: 1 },
  { i: "w3", x: 0, y: 3, w: 3, h: 2, minW: 1, minH: 1 },
  { i: "w4", x: 3, y: 3, w: 3, h: 2, minW: 1, minH: 1 },
];

// ─── Page ───

export default function DashboardPage() {
  const { user } = useAuth();
  const { id: projectId, phoenixProject: project, role } = useProject();
  const t = useT();
  const isViewer = !canEdit(role);

  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [layouts, setLayouts] = useState<LayoutItem[]>(DEFAULT_LAYOUTS);
  const [viewModes, setViewModes] = useState<Record<string, WidgetViewMode>>({});
  const [widgetColors, setWidgetColors] = useState<Record<string, WidgetColors>>({});
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationData[]>([]);
  const [spans, setSpans] = useState<SpanData[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange(7));
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [lastUpdatedByName, setLastUpdatedByName] = useState<string | null>(null);

  // ─── Load persisted layout (shared per-project) ───

  const loadLayout = useCallback(async () => {
    if (!projectId) return;
    setLayoutLoaded(false);
    try {
      const r = await apiFetch(`/api/dashboard/layout?projectId=${encodeURIComponent(projectId)}`);
      const data = await r.json();
      if (data.layout) {
        const parsed = JSON.parse(data.layout);
        const w = fixWidgetTitles(parsed.widgets ?? DEFAULT_WIDGETS);
        setWidgets(w);
        setLayouts(fixLayoutMins(parsed.layouts ?? DEFAULT_LAYOUTS, w));
        setViewModes(parsed.viewModes ?? {});
        setWidgetColors(parsed.widgetColors ?? {});
      } else {
        setWidgets(DEFAULT_WIDGETS);
        setLayouts(DEFAULT_LAYOUTS);
        setWidgetColors({});
      }
      setLastUpdatedAt(data.updatedAt ?? null);
      setLastUpdatedByName(data.updatedByName ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLayoutLoaded(true);
    }
  }, [projectId]);

  useEffect(() => {
    if (!user) return;
    loadLayout();
  }, [user, loadLayout]);

  const saveLayout = useCallback(
    (
      newLayouts: readonly LayoutItem[],
      newWidgets?: WidgetConfig[],
      newViewModes?: Record<string, WidgetViewMode>,
      newColors?: Record<string, WidgetColors>,
    ) => {
      if (!layoutLoaded || !user || isViewer || !projectId) return;
      const w = newWidgets ?? widgets;
      const vm = newViewModes ?? viewModes;
      const wc = newColors ?? widgetColors;
      setLayouts([...newLayouts] as LayoutItem[]);
      apiFetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          layout: JSON.stringify({ widgets: w, layouts: newLayouts, viewModes: vm, widgetColors: wc }),
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.updatedAt) {
            setLastUpdatedAt(data.updatedAt);
            // Show ourselves as the updater immediately; a follow-up GET on the
            // next SSE message or refresh will pull the canonical display name.
            setLastUpdatedByName(user.displayName ?? user.email ?? lastUpdatedByName);
          }
        })
        .catch((e) => { console.error(e); });
    },
    [user, widgets, viewModes, widgetColors, projectId, layoutLoaded, isViewer, lastUpdatedByName],
  );

  // ─── SSE: refetch when another user saves ───

  useEffect(() => {
    if (!projectId || !user) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const { auth } = await import("@/lib/firebase");
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/sse/project/${encodeURIComponent(projectId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: ctrl.signal,
        });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const events = buf.split("\n\n");
          buf = events.pop() ?? "";
          for (const ev of events) {
            const dataLine = ev.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const msg = JSON.parse(dataLine.slice(6));
              if (
                msg?.type === "layout-updated" &&
                msg.projectId === projectId &&
                msg.savedBy !== user.uid
              ) {
                loadLayout();
              }
            } catch {
              /* keep-alive comment or malformed payload — ignore */
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") console.error("[sse]", e);
      }
    })();
    return () => ctrl.abort();
  }, [projectId, user, loadLayout]);

  // ─── Data loading ───

  useEffect(() => {
    async function load() {
      try {
        let spansUrl = `/api/v1/projects/${encodeURIComponent(project)}/spans?limit=500`;
        if (dateRange.from) spansUrl += `&start_time=${encodeURIComponent(dateRange.from.toISOString())}`;
        if (dateRange.to) spansUrl += `&end_time=${encodeURIComponent(dateRange.to.toISOString())}`;
        const spansRes = await apiFetch(spansUrl);
        const spansData = await spansRes.json();
        const allSpans: any[] = spansData.data ?? [];

        const spanList: SpanData[] = allSpans.map((s: any) => {
          const attrs = s.attributes ?? {};
          return {
            latency: s.end_time ? new Date(s.end_time).getTime() - new Date(s.start_time).getTime() : 0,
            status: s.status_code ?? "OK",
            time: s.start_time,
            promptTokens: attrs["llm.token_count.prompt"] ?? 0,
            completionTokens: attrs["llm.token_count.completion"] ?? 0,
            totalTokens: attrs["llm.token_count.total"] ?? 0,
            model: attrs["llm.model_name"] ?? "",
            spanKind: s.span_kind ?? "",
          };
        });
        setSpans(spanList);

        const rootSpans = allSpans.filter((s: any) => s.parent_id === null);
        const annResults: AnnotationData[] = [];
        await Promise.all(
          rootSpans.slice(0, 100).map((s: any) =>
            apiFetch(`/api/v1/projects/${encodeURIComponent(project)}/span_annotations?span_ids=${s.context.span_id}`)
              .then((r) => r.json())
              .then((data) => {
                for (const a of data.data ?? []) {
                  annResults.push({ name: a.name, label: a.result?.label ?? "", score: a.result?.score ?? 0, time: s.start_time });
                }
              })
              .catch((e) => { console.error(e); }),
          ),
        );
        setAnnotations(annResults);
      } catch (e) {
        console.error(e);
      }
    }
    load();
  }, [project, dateRange]);

  // ─── Widget rendering ───

  const renderWidget = useCallback(
    (widget: WidgetConfig, viewMode: WidgetViewMode, gridW: number, gridH: number, colors: WidgetColors) => {
      const meta = getWidget(widget.type);
      if (!meta) return <div className="text-muted-foreground text-sm">Unknown widget</div>;
      return meta.render({ annotations, spans, viewMode, gridW, gridH, colors });
    },
    [annotations, spans],
  );

  // ─── Widget CRUD ───

  const handleAddWidget = useCallback(
    (type: string, title: string) => {
      const id = `w${Date.now()}`;
      const min = widgetMinSize(type);
      const w = LARGE_MIN_TYPES.has(type) ? 6 : 3;
      const h = LARGE_MIN_TYPES.has(type) ? 3 : 2;
      const pos = findBottomPosition(layouts, w, h, 10);
      const newWidgets = [...widgets, { id, type, title }];
      const newLayout: LayoutItem = { i: id, x: pos.x, y: pos.y, w, h, ...min };
      const newLayouts = [...layouts, newLayout];
      setWidgets(newWidgets);
      setLayouts(newLayouts);
    },
    [widgets, layouts],
  );

  const handleViewModeChange = useCallback(
    (id: string, mode: WidgetViewMode) => {
      const newVm = { ...viewModes, [id]: mode };
      setViewModes(newVm);
      saveLayout(layouts, undefined, newVm);
    },
    [viewModes, layouts, saveLayout],
  );

  const handleColorChange = useCallback(
    (id: string, colors: WidgetColors) => {
      const newColors = { ...widgetColors, [id]: colors };
      setWidgetColors(newColors);
      saveLayout(layouts, undefined, undefined, newColors);
    },
    [widgetColors, layouts, saveLayout],
  );

  const handleRemoveWidget = useCallback(
    (id: string) => {
      const newWidgets = widgets.filter((w) => w.id !== id);
      const newLayouts = layouts.filter((l) => l.i !== id);
      setWidgets(newWidgets);
      saveLayout(newLayouts, newWidgets);
    },
    [widgets, layouts, saveLayout],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
        <Heading level="page">{t.dashboard.title}</Heading>
        <div className="h-4 w-px bg-border/60" />
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <RoleGate>
          <AddWidgetMenu onAdd={handleAddWidget} />
        </RoleGate>
        {isViewer && (
          <span className="rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t.dashboard.viewOnly}
          </span>
        )}
        <LastUpdatedBadge updatedAt={lastUpdatedAt} updatedByName={lastUpdatedByName} />
      </div>
      <div
        className="relative flex-1 overflow-y-auto p-4"
        style={{
          backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {layoutLoaded && (
          <WidgetGrid
            widgets={widgets}
            layouts={layouts}
            viewModes={viewModes}
            widgetColors={widgetColors}
            readOnly={isViewer}
            onSaveLayout={(l) => saveLayout(l)}
            onRemoveWidget={handleRemoveWidget}
            onViewModeChange={handleViewModeChange}
            onColorChange={handleColorChange}
            renderWidget={renderWidget}
          />
        )}
      </div>
    </div>
  );
}
