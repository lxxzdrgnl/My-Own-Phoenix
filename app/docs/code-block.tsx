"use client";

import { useState, type ReactNode } from "react";
import { Copy, Check } from "lucide-react";
import { UI_FEEDBACK_RESET_MS } from "@/lib/config/timeouts";

/* ── syntax colors (Material Theme – matches home page code snippet) ── */
const C = {
  kw: "#c792ea",
  str: "#c3e88d",
  cmt: "#546e7a",
  const: "#f78c6c",
  deco: "#c792ea",
};

const PY_KW = new Set([
  "import","from","def","class","return","if","else","elif","for","while",
  "in","not","and","or","is","with","as","try","except","finally","raise",
  "yield","async","await","pass","break","continue","lambda","global",
]);
const PY_CONST = new Set(["True","False","None","self"]);

function hlPython(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < line.length) {
    if (line[i] === "#") {
      out.push(<span key={k++} style={{ color: C.cmt }}>{line.slice(i)}</span>);
      return out;
    }
    if (line[i] === "@" && (i === 0 || /\s/.test(line[i - 1]))) {
      let j = i + 1;
      while (j < line.length && /[\w.]/.test(line[j])) j++;
      out.push(<span key={k++} style={{ color: C.deco }}>{line.slice(i, j)}</span>);
      i = j;
      continue;
    }
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== q) { if (line[j] === "\\") j++; j++; }
      j = Math.min(j + 1, line.length);
      out.push(<span key={k++} style={{ color: C.str }}>{line.slice(i, j)}</span>);
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(line[i])) {
      let j = i;
      while (j < line.length && /\w/.test(line[j])) j++;
      const w = line.slice(i, j);
      if (PY_KW.has(w)) out.push(<span key={k++} style={{ color: C.kw }}>{w}</span>);
      else if (PY_CONST.has(w)) out.push(<span key={k++} style={{ color: C.const }}>{w}</span>);
      else out.push(<span key={k++}>{w}</span>);
      i = j;
      continue;
    }
    let j = i;
    while (j < line.length && !/[#@"'a-zA-Z_]/.test(line[j])) j++;
    out.push(<span key={k++}>{line.slice(i, j)}</span>);
    i = j;
  }
  return out;
}

function hlBash(line: string): ReactNode[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#")) {
    return [<span key={0} style={{ color: C.cmt }}>{line}</span>];
  }
  const out: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < line.length) {
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== q) { if (line[j] === "\\") j++; j++; }
      j = Math.min(j + 1, line.length);
      out.push(<span key={k++} style={{ color: C.str }}>{line.slice(i, j)}</span>);
      i = j;
      continue;
    }
    let j = i;
    while (j < line.length && line[j] !== '"' && line[j] !== "'") j++;
    out.push(<span key={k++}>{line.slice(i, j)}</span>);
    i = j;
  }
  return out;
}

function highlight(code: string, filename?: string): ReactNode {
  const isPy = filename?.endsWith(".py");
  const isBash = filename === "terminal" || filename?.endsWith(".sh");
  if (!isPy && !isBash) return code;
  const fn = isPy ? hlPython : hlBash;
  return code.split("\n").map((line, i) => (
    <span key={i}>
      {i > 0 && "\n"}
      {fn(line)}
    </span>
  ));
}

/* ── components ── */

export function CodeBlock({ code, filename }: { code: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), UI_FEEDBACK_RESET_MS);
  };

  return (
    <div className="group relative rounded-xl bg-[#0f0f17] overflow-hidden shadow-lg shadow-black/[0.08]">
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          {filename && (
            <span className="ml-3 text-[10px] text-[#555]">{filename}</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="rounded-md p-1.5 text-[#444] opacity-0 transition-all group-hover:opacity-100 hover:text-[#888] hover:bg-[#1a1a2e]"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="px-5 pb-5 pt-4 font-mono text-[13px] text-[#c8ccd4] overflow-x-auto leading-relaxed">
        <pre><code>{highlight(code, filename)}</code></pre>
      </div>
    </div>
  );
}

/** Render inline markdown: **bold** and `code` */
export function Md({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    // Match **bold** or `code`
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);
    // Find earliest match
    const matches = [
      boldMatch ? { type: "bold" as const, index: boldMatch.index!, length: boldMatch[0].length, content: boldMatch[1] } : null,
      codeMatch ? { type: "code" as const, index: codeMatch.index!, length: codeMatch[0].length, content: codeMatch[1] } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);
    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }
    const m = matches[0]!;
    if (m.index > 0) parts.push(remaining.slice(0, m.index));
    if (m.type === "bold") {
      parts.push(<strong key={key++} className="text-foreground font-semibold">{m.content}</strong>);
    } else {
      parts.push(<code key={key++} className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{m.content}</code>);
    }
    remaining = remaining.slice(m.index + m.length);
  }
  return <>{parts}</>;
}

export function Callout({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border-l-2 border-foreground/20 bg-muted/30 px-4 py-3">
      {title && <p className="text-xs font-semibold mb-1">{title}</p>}
      <div className="text-xs text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

export function DocTable({ headers, rows }: { headers: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={i} className="transition-colors hover:bg-muted/20">
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-2.5 ${j === 0 ? "font-medium" : "text-muted-foreground"}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
