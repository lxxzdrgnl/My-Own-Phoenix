"use client";

import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ChevronDown, Wifi, WifiOff } from "lucide-react";

interface ConnectedAgent {
  userId: string;
  userName: string;
  agentType: string;
  status: "online" | "offline";
}

export function AgentSelector({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (userId: string) => void;
}) {
  const { id: projectId } = useProject();
  const { user } = useAuth();
  const [agents, setAgents] = useState<ConnectedAgent[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/connectors?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.connectors || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const selectedAgent = agents.find((a) => a.userId === selected);
  const myAgent = agents.find((a) => a.userId === user?.uid);
  const onlineAgents = agents.filter((a) => a.status === "online");

  // Auto-select first online agent
  useEffect(() => {
    if (!selected && onlineAgents.length > 0) {
      onSelect(
        myAgent?.status === "online" ? myAgent.userId : onlineAgents[0].userId
      );
    }
  }, [agents, selected, myAgent, onlineAgents, onSelect]);

  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-center">
        <WifiOff className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">No agents connected</p>
        <p className="mt-1 text-[10px] text-muted-foreground/60">
          Run: phoenix-connector --key=pc_... --project=...
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-accent"
      >
        <div className="flex items-center gap-2">
          {selectedAgent?.status === "online" ? (
            <Wifi className="h-3 w-3 text-emerald-500" />
          ) : (
            <WifiOff className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="font-medium">
            {selectedAgent?.userName || "Select agent"}
          </span>
          {selectedAgent && (
            <span className="text-muted-foreground">
              ({selectedAgent.agentType})
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border bg-popover shadow-lg">
          <div className="py-1">
            {agents.map((a) => (
              <button
                key={a.userId}
                disabled={a.status !== "online"}
                onClick={() => {
                  onSelect(a.userId);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors",
                  a.status === "online"
                    ? "hover:bg-accent"
                    : "opacity-40 cursor-not-allowed",
                  selected === a.userId && "bg-accent font-medium"
                )}
              >
                {a.status === "online" ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                )}
                <span>{a.userName}</span>
                <span className="text-muted-foreground">({a.agentType})</span>
                {a.userId === user?.uid && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    you
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
