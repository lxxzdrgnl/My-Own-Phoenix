"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { type RawSpan } from "@/lib/phoenix";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

// ─── Layout ─────────────────────────────────────────────────────────────

interface GNode {
  id: string;
  name: string;
  kind: string;
  latency: number;
  childIds: string[];
  x: number;
  y: number;
}

const W = 120, H = 72, GX = 40, GY = 50, PAD = 40;
const ZOOM_STEP = 0.1, MIN_Z = 0.2, MAX_Z = 2;

const KIND_COLORS: Record<string, string> = {
  AGENT: "#171717", LLM: "#059669", CHAIN: "#2563eb",
  RETRIEVER: "#db2777", TOOL: "#d97706", PROMPT: "#7c3aed",
};
function kindColor(k: string) { return KIND_COLORS[k.toUpperCase()] ?? "#737373"; }
function fmtMs(ms: number) { return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`; }

function buildGraph(root: RawSpan, exclude?: Set<string>) {
  const nodes = new Map<string, GNode>();
  const isExcluded = (s: RawSpan) =>
    !!exclude && exclude.has((s.spanKind ?? "").toUpperCase());

  // Create nodes, skipping excluded spans AND their descendants — they're not
  // meaningful standalone in the graph view.
  function create(s: RawSpan) {
    if (isExcluded(s)) return;
    const kids = s.children.filter((c) => !isExcluded(c));
    nodes.set(s.spanId, {
      id: s.spanId,
      name: s.name.length > 14 ? s.name.slice(0, 12) + "…" : s.name,
      kind: s.spanKind,
      latency: s.latency,
      childIds: kids.map((c) => c.spanId),
      x: 0, y: 0,
    });
    kids.forEach(create);
  }
  if (isExcluded(root)) return { nodes, w: W, h: H };
  create(root);

  // Tidy-tree layout: place each subtree under its parent. Leaves take the next
  // horizontal slot (so sibling subtrees never overlap); a parent is centered
  // over the span of its children. Depth maps to the vertical axis.
  let cursor = 0;
  let maxDepth = 0;
  function place(s: RawSpan, depth: number) {
    const n = nodes.get(s.spanId);
    if (!n) return;
    maxDepth = Math.max(maxDepth, depth);
    n.y = depth * (H + GY);
    const kids = s.children.filter((c) => nodes.has(c.spanId));
    if (kids.length === 0) {
      n.x = cursor;
      cursor += W + GX;
      return;
    }
    kids.forEach((c) => place(c, depth + 1));
    const first = nodes.get(kids[0].spanId)!;
    const last = nodes.get(kids[kids.length - 1].spanId)!;
    n.x = (first.x + last.x) / 2;
  }
  place(root, 0);

  let maxX = 0;
  nodes.forEach((n) => { maxX = Math.max(maxX, n.x); });
  return { nodes, w: maxX + W, h: maxDepth * (H + GY) + H };
}

// ─── Canvas renderer ────────────────────────────────────────────────────

function drawGraph(
  ctx: CanvasRenderingContext2D, nodes: Map<string, GNode>,
  cw: number, ch: number, gw: number, gh: number,
  zoom: number, panX: number, panY: number, selectedId: string | null,
) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  // Center offset
  const ox = (cw - gw * zoom) / 2 + panX;
  const oy = PAD + panY;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(zoom, zoom);

  // Edges
  ctx.strokeStyle = "#d4d4d8";
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([4 / zoom, 3 / zoom]);
  nodes.forEach(n => {
    for (const cid of n.childIds) {
      const c = nodes.get(cid);
      if (!c) continue;
      const x1 = n.x + W / 2, y1 = n.y + H;
      const x2 = c.x + W / 2, y2 = c.y;
      const my = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1, my, x2, my, x2, y2);
      ctx.stroke();
    }
  });
  ctx.setLineDash([]);

  // Nodes
  nodes.forEach(n => {
    const color = kindColor(n.kind);
    const selected = n.id === selectedId;
    const r = 12;

    // Card
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 3 / zoom : 2 / zoom;
    ctx.beginPath();
    ctx.roundRect(n.x, n.y, W, H, r);
    ctx.fill();
    ctx.stroke();

    if (selected) {
      ctx.strokeStyle = "#171717";
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.roundRect(n.x - 3, n.y - 3, W + 6, H + 6, r + 2);
      ctx.stroke();
    }

    // Icon circle
    const cx = n.x + W / 2, cy = n.y + 20;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();

    // Icon letter
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${11}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const letter = n.kind.charAt(0).toUpperCase() || "?";
    ctx.fillText(letter, cx, cy);

    // Name
    ctx.fillStyle = "#171717";
    ctx.font = `500 ${10}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(n.name, cx, n.y + 40);

    // Latency
    ctx.fillStyle = "#737373";
    ctx.font = `${9}px system-ui, sans-serif`;
    ctx.fillText(fmtMs(n.latency), cx, n.y + 54);
  });

  ctx.restore();
}

// ─── Component ──────────────────────────────────────────────────────────

export function SpanGraph({
  rootSpan, selectedId, onSelect, excludeSpanKinds,
}: {
  rootSpan: RawSpan;
  selectedId?: string | null;
  onSelect?: (span: RawSpan) => void;
  /** Span kinds (uppercase) to omit from the graph entirely. */
  excludeSpanKinds?: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const graphRef = useRef<{ nodes: Map<string, GNode>; w: number; h: number } | null>(null);
  const spanMapRef = useRef<Map<string, RawSpan>>(new Map());
  const dragRef = useRef({ active: false, sx: 0, sy: 0, px: 0, py: 0 });
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  // Build graph
  useEffect(() => {
    const map = new Map<string, RawSpan>();
    (function walk(s: RawSpan) { map.set(s.spanId, s); s.children.forEach(walk); })(rootSpan);
    spanMapRef.current = map;
    const exclude = excludeSpanKinds && excludeSpanKinds.length > 0
      ? new Set(excludeSpanKinds.map((k) => k.toUpperCase()))
      : undefined;
    graphRef.current = buildGraph(rootSpan, exclude);

    // Auto-fit
    const el = wrapRef.current;
    if (el && graphRef.current) {
      const fit = Math.min(1, (el.clientWidth - 40) / (graphRef.current.w + PAD * 2));
      setZoom(Math.max(MIN_Z, fit));
    }
  }, [rootSpan, excludeSpanKinds]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    const g = graphRef.current;
    if (!canvas || !g) return;
    const wrap = wrapRef.current!;
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth;
    const ch = Math.max(300, g.h + PAD * 2 + 40);
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    const ctx = canvas.getContext("2d")!;
    drawGraph(ctx, g.nodes, cw, ch, g.w, g.h, zoom, pan.x, pan.y, selectedId ?? null);
  }, [zoom, pan, selectedId, rootSpan]);

  // Wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const d = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom(z => Math.max(MIN_Z, Math.min(MAX_Z, z + d)));
    }
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Mouse: drag + click
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onDown(e: MouseEvent) {
      const d = dragRef.current;
      d.active = true;
      d.sx = e.clientX; d.sy = e.clientY;
      d.px = panRef.current.x; d.py = panRef.current.y;
      canvas!.style.cursor = "grabbing";
    }
    function onMove(e: MouseEvent) {
      if (!dragRef.current.active) return;
      const d = dragRef.current;
      setPan({ x: d.px + e.clientX - d.sx, y: d.py + e.clientY - d.sy });
    }
    function onUp(e: MouseEvent) {
      const d = dragRef.current;
      const moved = Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy);
      d.active = false;
      canvas!.style.cursor = "grab";

      // Click detection (didn't drag)
      if (moved < 5 && graphRef.current && onSelect) {
        const rect = canvas!.getBoundingClientRect();
        const g = graphRef.current;
        const cw = rect.width;
        const ox = (cw - g.w * zoomRef.current) / 2 + panRef.current.x;
        const oy = PAD + panRef.current.y;
        const mx = (e.clientX - rect.left - ox) / zoomRef.current;
        const my = (e.clientY - rect.top - oy) / zoomRef.current;
        for (const n of g.nodes.values()) {
          if (mx >= n.x && mx <= n.x + W && my >= n.y && my <= n.y + H) {
            const raw = spanMapRef.current.get(n.id);
            if (raw) onSelect(raw);
            break;
          }
        }
      }
    }

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.style.cursor = "grab";

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onSelect]);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(MAX_Z, z + ZOOM_STEP)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(MIN_Z, z - ZOOM_STEP)), []);
  const handleFit = useCallback(() => {
    const g = graphRef.current, el = wrapRef.current;
    if (!g || !el) return;
    const fit = Math.min(1, (el.clientWidth - 40) / (g.w + PAD * 2), (el.clientHeight - 80) / (g.h + PAD * 2));
    setZoom(Math.max(MIN_Z, fit));
    setPan({ x: 0, y: 0 });
  }, []);

  const g = graphRef.current;
  const ch = g ? Math.max(300, g.h + PAD * 2 + 40) : 300;

  return (
    <div ref={wrapRef} className="relative rounded-lg border bg-muted/20" style={{ height: ch }}>
      <div className="absolute top-1 right-1 z-10 flex gap-0.5 px-2 py-1 rounded bg-card/80 backdrop-blur-sm">
        <button onClick={handleZoomOut} className="rounded p-1 hover:bg-accent" title="Zoom out">
          <ZoomOut className="size-3.5 text-muted-foreground" />
        </button>
        <span className="flex items-center px-1 text-[10px] text-muted-foreground tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={handleZoomIn} className="rounded p-1 hover:bg-accent" title="Zoom in">
          <ZoomIn className="size-3.5 text-muted-foreground" />
        </button>
        <button onClick={handleFit} className="rounded p-1 hover:bg-accent" title="Fit to view">
          <Maximize2 className="size-3.5 text-muted-foreground" />
        </button>
      </div>
      <canvas ref={canvasRef} className="block w-full" style={{ height: ch }} />
    </div>
  );
}
