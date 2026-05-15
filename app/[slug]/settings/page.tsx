"use client";

import { useState, useEffect } from "react";
import { useProject } from "@/lib/project-context";
import { MembersTab } from "./members-tab";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

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
        <div className="space-y-6">
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Trace API Key</h3>
            <div className="rounded-lg border px-5 py-4">
              <p className="text-xs text-muted-foreground mb-3">
                Use this key to send traces from your agent to this project.
                Set it as the <code className="rounded bg-muted px-1.5 py-0.5 font-mono">PHOENIX_API_KEY</code> environment variable.
              </p>
              <p className="text-xs text-muted-foreground">
                Trace keys are generated when the project is created and shown once.
                If you need a new key, regenerate it below.
              </p>
            </div>
          </section>
        </div>
      )}
      {activeTab === "agent" && <AgentTab />}
      {activeTab === "eval" && (
        <div className="space-y-6">
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Eval Worker</h3>
            <div className="rounded-lg border px-5 py-4">
              <p className="text-xs text-muted-foreground">
                The eval worker runs automated evaluations on new traces.
                Configure it in Global Settings.
              </p>
            </div>
          </section>
        </div>
      )}
      {activeTab === "danger" && (
        <div className="space-y-6">
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-destructive mb-3">Delete Project</h3>
            <div className="rounded-lg border border-destructive/20 px-5 py-4">
              <p className="text-xs text-muted-foreground mb-3">
                Permanently delete this project and all its data. This action cannot be undone.
              </p>
              <button className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90">
                Delete Project
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function AgentTab() {
  const { id: projectId, name } = useProject();
  const [connectors, setConnectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/connectors?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => setConnectors(data.connectors || []))
      .catch(console.error)
      .finally(() => setLoading(false));

    const interval = setInterval(() => {
      apiFetch(`/api/connectors?projectId=${projectId}`)
        .then((r) => r.json())
        .then((data) => setConnectors(data.connectors || []))
        .catch(console.error);
    }, 10000);
    return () => clearInterval(interval);
  }, [projectId]);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Connected Agents
        </h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : connectors.length === 0 ? (
          <div className="rounded-lg border border-dashed px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground mb-1">No agents connected</p>
            <p className="text-xs text-muted-foreground/60">
              Connect your local agent using the phoenix-connector CLI.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {connectors.map((c: any) => (
              <div
                key={c.userId}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {c.status === "online" ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{c.userName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {c.agentType} · {c.status}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Setup Guide
        </h3>
        <div className="rounded-lg border px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Connect your local agent using the phoenix-connector CLI:
          </p>
          <div className="rounded-lg bg-muted/50 p-3 font-mono text-xs text-muted-foreground break-all">
            pip install phoenix-connector
            <br />
            phoenix-connector --key=pc_... --agent=http://localhost:2024 --project={name}
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            Get your connector key from Global Settings &rarr; Profile &amp; Key.
          </p>
        </div>
      </section>
    </div>
  );
}
