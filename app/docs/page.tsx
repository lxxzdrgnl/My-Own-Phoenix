"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Sidebar, SidebarHeader, SidebarItem } from "@/components/ui/sidebar";
import { QuickStart } from "./sections/quickstart";
import { PhoenixTracing } from "./sections/phoenix-tracing";
import { TracingOnly } from "./sections/tracing-only";
import { Connector } from "./sections/connector";
import { AgentTypes } from "./sections/agent-types";
import { Projects } from "./sections/projects";
import { ApiReference } from "./sections/api";

const GROUPS = [
  {
    label: "Getting Started",
    items: [
      { id: "quickstart", label: "Quick Start" },
      { id: "tracing", label: "Phoenix Tracing" },
    ],
  },
  {
    label: "Guides",
    items: [
      { id: "tracing-only", label: "Tracing Only" },
      { id: "connector", label: "Agent Connector" },
      { id: "agent-types", label: "Agent Types" },
    ],
  },
  {
    label: "Reference",
    items: [
      { id: "projects", label: "Projects & Teams" },
      { id: "api", label: "API Reference" },
    ],
  },
];

const SECTION_COMPONENTS: Record<string, React.FC> = {
  quickstart: QuickStart,
  tracing: PhoenixTracing,
  "tracing-only": TracingOnly,
  connector: Connector,
  "agent-types": AgentTypes,
  projects: Projects,
  api: ApiReference,
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
          className="docs-stagger mx-auto max-w-3xl px-8 py-10"
        >
          {ActiveSection && <ActiveSection />}
        </div>
      </div>
    </div>
  );
}
