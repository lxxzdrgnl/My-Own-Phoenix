"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { ProviderIcon } from "@/components/provider-icon";
import { LLM_PROVIDERS } from "@/lib/model-registry";


export function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeProviders, setActiveProviders] = useState<Set<string>>(new Set());

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
  }, []);

  // Find which provider the current value belongs to
  const currentProvider = LLM_PROVIDERS.find((p) =>
    p.families.some((f) => f.models.some((m) => m.id === value)),
  );

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      // Auto-expand current provider
      if (currentProvider) setExpandedProvider(currentProvider.name);
    }
  }, [open, currentProvider]);

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
        {currentProvider && (
          <ProviderIcon provider={currentProvider.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate text-left font-mono text-sm">{value}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
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
              placeholder="Search models..."
              className="h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {LLM_PROVIDERS.map((provider) => {
              // When searching, flatten and show all matches
              if (isSearching) {
                const matches = provider.families.flatMap((f) =>
                  f.models.filter(
                    (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
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
                        disabled={!activeProviders.has(provider.name.toLowerCase())}
                        onClick={() => {
                          onChange(m.id);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-sm transition-colors
                          ${!activeProviders.has(provider.name.toLowerCase())
                            ? "cursor-not-allowed opacity-30"
                            : m.id === value
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

              // Normal hierarchical view
              const isProviderExpanded = expandedProvider === provider.name;

              return (
                <div key={provider.name}>
                  {/* Provider row */}
                  <button
                    onClick={() => {
                      if (!activeProviders.has(provider.name.toLowerCase())) return;
                      setExpandedProvider(isProviderExpanded ? null : provider.name);
                      setExpandedFamily(null);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors
                      ${!activeProviders.has(provider.name.toLowerCase()) ? "cursor-not-allowed opacity-30" : "hover:bg-muted"}`}
                  >
                    <ChevronRight
                      className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isProviderExpanded ? "rotate-90" : ""}`}
                    />
                    <ProviderIcon provider={provider.icon} className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-sm font-medium">{provider.name}</span>
                  </button>

                  {/* Families */}
                  {isProviderExpanded &&
                    provider.families.map((family) => {
                      const isFamilyExpanded = expandedFamily === `${provider.name}/${family.label}`;
                      const familyKey = `${provider.name}/${family.label}`;

                      return (
                        <div key={familyKey}>
                          {/* Family row */}
                          <button
                            onClick={() =>
                              setExpandedFamily(isFamilyExpanded ? null : familyKey)
                            }
                            className="flex w-full items-center gap-2 py-1.5 pl-8 pr-3 text-left transition-colors hover:bg-muted"
                          >
                            <ChevronRight
                              className={`h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform ${isFamilyExpanded ? "rotate-90" : ""}`}
                            />
                            <span className="text-sm text-muted-foreground">
                              {family.label}
                            </span>
                            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/50">
                              {family.models.length}
                            </span>
                          </button>

                          {/* Models */}
                          {isFamilyExpanded &&
                            family.models.map((m) => (
                              <button
                                key={m.id}
                                onClick={() => {
                                  onChange(m.id);
                                  setOpen(false);
                                  setSearch("");
                                }}
                                className={`flex w-full items-center py-1.5 pl-14 pr-3 text-left font-mono text-sm transition-colors
                                  ${m.id === value
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
