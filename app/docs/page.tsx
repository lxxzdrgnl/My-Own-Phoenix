"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Sidebar, SidebarHeader, SidebarItem } from "@/components/ui/sidebar";
import { QuickStart } from "./sections/quickstart";
import { ConnectorSetup } from "./sections/connector-setup";
import { ApiKeys } from "./sections/api-keys";
import { PhoenixTracing } from "./sections/phoenix-tracing";
import { Evaluations } from "./sections/evaluations";
import { Dashboard } from "./sections/dashboard";
import { Datasets } from "./sections/datasets";
import { Chat } from "./sections/chat";
import { Playground } from "./sections/playground";
const GROUPS = [
  {
    label: "Getting Started",
    items: [
      { id: "quickstart", label: "Quick Start (Tracing)" },
      { id: "connector-setup", label: "Connector Setup" },
      { id: "api-keys", label: "API Keys" },
    ],
  },
  {
    label: "Features",
    items: [
      { id: "tracing", label: "Tracing" },
      { id: "evaluations", label: "Evaluations" },
      { id: "dashboard", label: "Dashboard" },
      { id: "datasets", label: "Datasets" },
      { id: "chat", label: "Chat" },
      { id: "playground", label: "Playground" },
    ],
  },
];

const SECTION_COMPONENTS: Record<string, React.FC> = {
  quickstart: QuickStart,
  "connector-setup": ConnectorSetup,
  "api-keys": ApiKeys,
  tracing: PhoenixTracing,
  evaluations: Evaluations,
  dashboard: Dashboard,
  datasets: Datasets,
  chat: Chat,
  playground: Playground,
};

export default function DocsPage() {
  const [active, setActive] = useState("quickstart");
  const scrollRef = useRef<HTMLDivElement>(null);
  const ActiveSection = SECTION_COMPONENTS[active];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [active]);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <Sidebar className="p-5 bg-card">
        <button
          onClick={() => window.history.back()}
          className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>

        <h2 className="mb-1 text-sm font-bold tracking-tight">
          My Own Phoenix
        </h2>
        <p className="mb-6 text-[10px] text-muted-foreground">Documentation</p>

        <nav className="space-y-5">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <SidebarHeader className="mb-1.5 px-2.5">
                {group.label}
              </SidebarHeader>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarItem
                    key={item.id}
                    active={active === item.id}
                    onClick={() => setActive(item.id)}
                  >
                    {item.label}
                  </SidebarItem>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t">
          <a
            href="/api/docs"
            target="_blank"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Swagger API
          </a>
        </div>
      </Sidebar>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-background">
        <div
          key={active}
          className="docs-stagger mx-auto max-w-5xl px-10 py-10"
        >
          {ActiveSection && <ActiveSection />}
        </div>
      </div>
    </div>
  );
}
