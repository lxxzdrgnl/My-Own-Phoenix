"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Settings2, Key, FlaskConical, ArrowLeft } from "lucide-react";
import { Sidebar } from "@/components/ui/sidebar";
import { GeneralSection } from "./general-section";
import { ProvidersSection } from "./providers-section";
import { EvalTemplatesSection } from "./eval-templates-section";
import { ChatSection } from "./chat-section";

interface TabDef {
  id: string;
  label: string;
  icon: typeof Settings2;
  desc: string;
}

const TAB_GROUPS: { label: string; tabs: TabDef[] }[] = [
  {
    label: "Account",
    tabs: [
      { id: "general", label: "Profile & Key", icon: Settings2, desc: "Account & connector key" },
      { id: "providers", label: "Providers", icon: Key, desc: "LLM API keys" },
    ],
  },
  {
    label: "Templates",
    tabs: [
      { id: "eval-templates", label: "Evaluations", icon: FlaskConical, desc: "Global eval templates" },
    ],
  },
];

const ALL_TAB_IDS = TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
type TabId = string;

export function SettingsPage() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab") ?? "general";
  const initialTab = ALL_TAB_IDS.includes(raw) ? raw : "general";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <div className="flex h-screen">
      <Sidebar className="py-4 bg-card">
        <div className="px-4 mb-5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back
          </button>
          <h2 className="mt-3 text-sm font-semibold">Global Settings</h2>
        </div>

        {TAB_GROUPS.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && "mt-3")}>
            <p className="mb-1.5 px-6 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40">
              {group.label}
            </p>
            <div className="px-3 space-y-0.5">
              {group.tabs.map(({ id, label, icon: Icon, desc }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-all",
                      active
                        ? "bg-accent font-medium"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium leading-tight">{label}</p>
                      <p className={cn("mt-0.5 text-[10px] leading-tight", active ? "text-muted-foreground" : "text-muted-foreground/40")}>
                        {desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="mt-auto border-t px-3 py-3">
          <a
            href="/docs"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-muted-foreground/50 transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium leading-tight">Docs</p>
            </div>
          </a>
        </div>
      </Sidebar>

      <div className="flex-1 overflow-y-auto bg-background">
        {activeTab === "eval-templates" ? (
          <EvalTemplatesSection />
        ) : (
          <div className="mx-auto max-w-2xl px-8 py-8">
            {activeTab === "general" && <GeneralSection />}
            {activeTab === "providers" && <ProvidersSection />}
          </div>
        )}
      </div>
    </div>
  );
}
