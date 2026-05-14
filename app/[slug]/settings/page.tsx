"use client";

import { useState } from "react";
import { useProject } from "@/lib/project-context";
import { MembersTab } from "./members-tab";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "members", label: "Members" },
  { id: "api-keys", label: "API Keys" },
  { id: "agent", label: "Agent" },
  { id: "eval", label: "Eval" },
  { id: "danger", label: "Danger Zone" },
];

export default function ProjectSettingsPage() {
  const { name } = useProject();
  const [activeTab, setActiveTab] = useState("members");

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold tracking-tight mb-1">Project Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">{name}</p>

      <div className="flex gap-1 border-b mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "members" && <MembersTab />}
      {activeTab === "api-keys" && (
        <p className="text-sm text-muted-foreground">API key management coming soon.</p>
      )}
      {activeTab === "agent" && (
        <p className="text-sm text-muted-foreground">Agent configuration coming soon.</p>
      )}
      {activeTab === "eval" && (
        <p className="text-sm text-muted-foreground">Eval worker configuration coming soon.</p>
      )}
      {activeTab === "danger" && (
        <p className="text-sm text-muted-foreground">Project deletion coming soon.</p>
      )}
    </div>
  );
}
