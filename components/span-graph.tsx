"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { type RawSpan } from "@/lib/phoenix";
import { cn } from "@/lib/utils";
import { Bot, Link2, Search, Box, MessageSquare, Zap, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

// ─── Layout helpers ─────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  name: string;
  kind: string;
  latency: number;
  children: string[];
  x: number;
  y: number;
}

const NODE_W = 120;
const NODE_H = 72;
const GAP_X = 40;
const GAP_Y = 50;

const KIND_STYLES: Record<string, { icon: typeof Bot; bg: string; border: string }> = {
  AGENT:     { icon: Bot,           bg: "bg-foreground",     border: "border-foreground" },
  LLM:       { icon: Bot,           bg: "bg-emerald-600",    border: "border-emerald-600" },
  CHAIN:     { icon: Link2,         bg: "bg-blue-600",       border: "border-blue-600" },
  RETRIEVER: { icon: Search,        bg: "bg-pink-600",       border: "border-pink-600" },
  TOOL:      { icon: Box,           bg: "bg-amber-600",      border: "border-amber-600" },
  PROMPT:    { icon: MessageSquare, bg: "bg-purple-600",     border: "border-purple-600" },
  DEFAULT:   { icon: Zap,           bg: "bg-muted-foreground", border: "border-muted-foreground" },
};

function getStyle(kind: string) {
  return KIND_STYLES[kind.toUpperCase()] ?? KIND_STYLES.DEFAULT;
}

function formatMs(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function buildGraph(root: RawSpan): { nodes: Map<string, GraphNode>; width: number; height: number } {
  const nodes = new Map<string, GraphNode>();
  const levels: string[][] = [];

  const queue: { span: RawSpan; level: number }[] = [{ span: root, level: 0 }];
  while (queue.length > 0) {
    const { span, level } = queue.shift()!;
    if (nodes.has(span.spanId)) continue;

    if (!levels[level]) levels[level] = [];
    levels[level].push(span.spanId);

    nodes.set(span.spanId, {
      id: span.spanId,
      name: span.name.length > 14 ? span.name.slice(0, 12) + "..." : span.name,
      kind: span.spanKind,
      latency: span.latency,
      children: span.children.map((c) => c.spanId),
      x: 0,
      y: 0,
    });

    for (const child of span.children) {
      queue.push({ span: child, level: level + 1 });
    }
  }

  let maxWidth = 0;
  for (let lvl = 0; lvl < levels.length; lvl++) {
    const ids = levels[lvl];
    const totalWidth = ids.length * NODE_W + (ids.length - 1) * GAP_X;
    maxWidth = Math.max(maxWidth, totalWidth);
  }

  for (let lvl = 0; lvl < levels.length; lvl++) {
    const ids = levels[lvl];
    const totalWidth = ids.length * NODE_W + (ids.length - 1) * GAP_X;
    const startX = (maxWidth - totalWidth) / 2;
    for (let i = 0; i < ids.length; i++) {
      const node = nodes.get(ids[i])!;
      node.x = startX + i * (NODE_W + GAP_X);
      node.y = lvl * (NODE_H + GAP_Y);
    }
  }

  return { nodes, width: maxWidth, height: levels.length * (NODE_H + GAP_Y) - GAP_Y };
}

// ─── Component ──────────────────────────────────────────────────────────

const ZOOM_STEP = 0.15;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;

export function SpanGraph({
  rootSpan,
  selectedId,
  onSelect,
}: {
  rootSpan: RawSpan;
  selectedId?: string | null;
  onSelect?: (span: RawSpan) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [graph, setGraph] = useState<{ nodes: Map<string, GraphNode>; width: number; height: number } | null>(null);
  const spanMap = useRef<Map<string, RawSpan>>(new Map());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  useEffect(() => {
    const map = new Map<string, RawSpan>();
    function walk(s: RawSpan) {
      map.set(s.spanId, s);
      s.children.forEach(walk);
    }
    walk(rootSpan);
    spanMap.current = map;
    setGraph(buildGraph(rootSpan));
  }, [rootSpan]);

  // Auto-fit zoom on mount
  useEffect(() => {
    if (!graph || !containerRef.current) return;
    const padding = 40;
    const contentW = graph.width + NODE_W + padding * 2;
    const containerW = containerRef.current.clientWidth - 16; // subtract padding
    if (contentW > containerW) {
      setZoom(Math.max(MIN_ZOOM, containerW / contentW));
    }
  }, [graph]);

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP)), []);
  const handleFit = useCallback(() => {
    if (!graph || !containerRef.current) return;
    const padding = 40;
    const contentW = graph.width + NODE_W + padding * 2;
    const contentH = graph.height + NODE_H + padding * 2;
    const containerW = containerRef.current.clientWidth - 16;
    const containerH = containerRef.current.clientHeight - 40;
    const fitZoom = Math.min(containerW / contentW, containerH / contentH, 1);
    setZoom(Math.max(MIN_ZOOM, fitZoom));
    setPan({ x: 0, y: 0 });
  }, [graph]);

  // Scroll wheel zoom + drag pan
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setZoom((z) => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta));
      });
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // Don't start drag if clicking a node button
      if ((e.target as HTMLElement).closest("button[class*='rounded-xl']")) return;
      dragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      el.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPan({
        x: dragStart.current.panX + (e.clientX - dragStart.current.x),
        y: dragStart.current.panY + (e.clientY - dragStart.current.y),
      });
    };

    const onMouseUp = () => {
      dragging.current = false;
      el.style.cursor = "grab";
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    el.style.cursor = "grab";

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [pan.x, pan.y]);

  if (!graph || graph.nodes.size === 0) return null;

  const padding = 40;
  const svgW = graph.width + NODE_W + padding * 2;
  const svgH = graph.height + NODE_H + padding * 2;

  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  graph.nodes.forEach((node) => {
    for (const childId of node.children) {
      const child = graph.nodes.get(childId);
      if (!child) continue;
      edges.push({
        x1: node.x + NODE_W / 2 + padding,
        y1: node.y + NODE_H + padding,
        x2: child.x + NODE_W / 2 + padding,
        y2: child.y + padding,
      });
    }
  });

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-lg border bg-muted/20">
      {/* Zoom controls */}
      <div className="sticky top-1 right-1 z-10 flex justify-end gap-0.5 px-2 py-1">
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

      <div
        className="mx-auto select-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "top center",
          width: svgW,
          height: svgH * zoom,
        }}
      >
        <svg className="absolute inset-0" width={svgW} height={svgH}>
          {edges.map((e, i) => {
            const midY = (e.y1 + e.y2) / 2;
            return (
              <path
                key={i}
                d={`M ${e.x1} ${e.y1} C ${e.x1} ${midY}, ${e.x2} ${midY}, ${e.x2} ${e.y2}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                className="text-border"
              />
            );
          })}
        </svg>

        {Array.from(graph.nodes.values()).map((node) => {
          const style = getStyle(node.kind);
          const Icon = style.icon;
          const isSelected = selectedId === node.id;

          return (
            <button
              key={node.id}
              onClick={() => {
                const raw = spanMap.current.get(node.id);
                if (raw && onSelect) onSelect(raw);
              }}
              className={cn(
                "absolute flex flex-col items-center justify-center rounded-xl border-2 bg-card transition-all hover:shadow-md",
                isSelected ? "ring-2 ring-foreground shadow-lg" : "",
                style.border,
              )}
              style={{
                left: node.x + padding,
                top: node.y + padding,
                width: NODE_W,
                height: NODE_H,
              }}
            >
              <div className={cn("flex size-7 items-center justify-center rounded-full text-white", style.bg)}>
                <Icon className="size-3.5" />
              </div>
              <p className="mt-1 text-[10px] font-medium leading-tight truncate max-w-[100px]">{node.name}</p>
              <p className="text-[9px] text-muted-foreground">{formatMs(node.latency)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
