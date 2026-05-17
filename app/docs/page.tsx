"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Sidebar, SidebarHeader, SidebarItem } from "@/components/ui/sidebar";
import { useT } from "@/lib/i18n";
import { Nav } from "@/components/nav";
import { QuickStart } from "./sections/quickstart";
import { ConnectorSetup } from "./sections/connector-setup";
import { ApiKeys } from "./sections/api-keys";
import { PhoenixTracing } from "./sections/phoenix-tracing";
import { Evaluations } from "./sections/evaluations";
import { Dashboard } from "./sections/dashboard";
import { Datasets } from "./sections/datasets";
import { Chat } from "./sections/chat";
import { Playground } from "./sections/playground";

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
  const t = useT();
  const [active, setActive] = useState("quickstart");
  const scrollRef = useRef<HTMLDivElement>(null);
  const ActiveSection = SECTION_COMPONENTS[active];

  const GROUPS = [
    {
      label: t.docs.gettingStarted,
      items: [
        { id: "quickstart", label: t.docs.quickstart.title },
        { id: "connector-setup", label: t.docs.connectorSetup.title },
        { id: "api-keys", label: t.docs.apiKeys.title },
      ],
    },
    {
      label: t.docs.features,
      items: [
        { id: "tracing", label: t.docs.tracing.title },
        { id: "evaluations", label: t.docs.evaluations.title },
        { id: "dashboard", label: t.docs.dashboard.title },
        { id: "datasets", label: t.docs.datasets.title },
        { id: "chat", label: t.docs.chat.title },
        { id: "playground", label: t.docs.playground.title },
      ],
    },
  ];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [active]);

  return (
    <div className="flex h-screen flex-col">
      <Nav fullWidth />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar className="p-5 bg-card">
          <button
            onClick={() => window.history.back()}
            className="mb-5 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            {t.common.back}
          </button>
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
        </Sidebar>

        {/* Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-background">
          <div
            key={active}
            className="docs-stagger mx-auto max-w-6xl px-6 py-10"
          >
            {ActiveSection && <ActiveSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
