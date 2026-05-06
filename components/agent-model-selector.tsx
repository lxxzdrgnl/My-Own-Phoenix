"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Search, Bot } from "lucide-react";
import { ProviderIcon } from "@/components/provider-icon";
import { LLM_PROVIDERS } from "@/lib/model-registry";

interface AgentOption {
  id: string;
  name: string;
  description?: string;
  agentType: string;
}

export function AgentModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [activeProviders, setActiveProviders] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<AgentOption[]>([]);

  useEffect(() => {
    apiFetch("/api/providers")
      .then((r) => r.json())
      .then((data) => {
        const active = new Set<string>();
        for (const p of data.providers ?? []) {
          if (p.isActive) active.add(p.provider);
        }
        setActiveProviders(active);
      })
      .catch(() => {});

    apiFetch("/api/agent-config")
      .then((r) => r.json())
      .then((data) => {
        // Deduplicate by template name — same agent template used in multiple projects should show once
        const seen = new Set<string>();
        const deduped: AgentOption[] = [];
        for (const c of data.configs ?? []) {
          const key = c.templateId || c.id;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push({
            id: c.id,
            name: c.template?.name || c.alias?.trim() || c.project,
            description: c.template?.description || c.project,
            agentType: c.agentType,
          });
        }
        setAgents(deduped);
      })
      .catch(() => {});
  }, []);

  const displayLabel = (() => {
    if (value.startsWith("agent:")) {
      const agentId = value.replace("agent:", "");
      const agent = agents.find((a) => a.id === agentId);
      return agent ? agent.name : value;
    }
    if (value.startsWith("llm:")) {
      return value.replace("llm:", "");
    }
    return value || "Select...";
  })();

  const isAgent = value.startsWith("agent:");

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const q = search.toLowerCase();
  const isSearching = q.length > 0;

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center gap-2 rounded-md border bg-background px-2.5 text-sm outline-none transition focus:ring-1 focus:ring-ring"
      >
        {isAgent ? (
          <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="flex-1 truncate text-left font-mono text-sm">{displayLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-10 z-50 w-72 overflow-hidden rounded-xl border bg-background shadow-xl">
          {/* Search */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models or agents..."
              className="h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {/* Agents section */}
            {agents.length > 0 &&
              (() => {
                const filtered = isSearching
                  ? agents.filter(
                      (a) =>
                        a.name.toLowerCase().includes(q) ||
                        a.description?.toLowerCase().includes(q),
                    )
                  : agents;
                if (filtered.length === 0) return null;

                const isExpanded = isSearching || expandedSection === "agents";

                return (
                  <div>
                    <button
                      onClick={() =>
                        setExpandedSection(isExpanded && !isSearching ? null : "agents")
                      }
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <ChevronRight
                        className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                      <Bot className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-sm font-medium">Agents</span>
                      <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/50">
                        {filtered.length}
                      </span>
                    </button>
                    {isExpanded &&
                      filtered.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            onChange(`agent:${a.id}`);
                            setOpen(false);
                            setSearch("");
                          }}
                          className={`flex w-full items-center gap-2 py-1.5 pl-10 pr-3 text-left text-sm transition-colors ${
                            value === `agent:${a.id}`
                              ? "bg-foreground/8 font-medium"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate">{a.name}</p>
                            <p className="truncate text-[10px] text-muted-foreground/50">
                              {a.agentType}
                            </p>
                          </div>
                        </button>
                      ))}
                  </div>
                );
              })()}

            {/* Divider between agents and providers */}
            {agents.length > 0 && <div className="my-1 border-t" />}

            {/* LLM Providers */}
            {LLM_PROVIDERS.map((provider) => {
              const isDisabled = !activeProviders.has(provider.name.toLowerCase());

              if (isSearching) {
                const matches = provider.families.flatMap((f) =>
                  f.models.filter(
                    (m) =>
                      m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
                  ),
                );
                if (matches.length === 0) return null;

                return (
                  <div key={provider.name}>
                    <div className="flex items-center gap-2 px-3 pt-2 pb-1">
                      <ProviderIcon provider={provider.icon} className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        {provider.name}
                      </span>
                    </div>
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        disabled={isDisabled}
                        onClick={() => {
                          onChange(`llm:${m.id}`);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-sm transition-colors ${
                          isDisabled
                            ? "cursor-not-allowed opacity-30"
                            : value === `llm:${m.id}`
                              ? "bg-foreground/8 font-medium"
                              : "hover:bg-muted"
                        }`}
                      >
                        <span className="w-3" />
                        {m.name}
                      </button>
                    ))}
                  </div>
                );
              }

              const isProviderExpanded = expandedSection === provider.name;

              return (
                <div key={provider.name}>
                  <button
                    onClick={() => {
                      if (isDisabled) return;
                      setExpandedSection(isProviderExpanded ? null : provider.name);
                      setExpandedFamily(null);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                      isDisabled ? "cursor-not-allowed opacity-30" : "hover:bg-muted"
                    }`}
                  >
                    <ChevronRight
                      className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isProviderExpanded ? "rotate-90" : ""}`}
                    />
                    <ProviderIcon provider={provider.icon} className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-sm font-medium">{provider.name}</span>
                  </button>

                  {isProviderExpanded &&
                    provider.families.map((family) => {
                      const familyKey = `${provider.name}/${family.label}`;
                      const isFamilyExpanded = expandedFamily === familyKey;

                      return (
                        <div key={familyKey}>
                          <button
                            onClick={() =>
                              setExpandedFamily(isFamilyExpanded ? null : familyKey)
                            }
                            className="flex w-full items-center gap-2 py-1.5 pl-8 pr-3 text-left transition-colors hover:bg-muted"
                          >
                            <ChevronRight
                              className={`h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform ${isFamilyExpanded ? "rotate-90" : ""}`}
                            />
                            <span className="text-sm text-muted-foreground">{family.label}</span>
                            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/50">
                              {family.models.length}
                            </span>
                          </button>

                          {isFamilyExpanded &&
                            family.models.map((m) => (
                              <button
                                key={m.id}
                                onClick={() => {
                                  onChange(`llm:${m.id}`);
                                  setOpen(false);
                                  setSearch("");
                                }}
                                className={`flex w-full items-center py-1.5 pl-14 pr-3 text-left font-mono text-sm transition-colors ${
                                  value === `llm:${m.id}`
                                    ? "bg-foreground/8 font-medium"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                              >
                                {m.name}
                              </button>
                            ))}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
