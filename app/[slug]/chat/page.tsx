"use client";

import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { Assistant } from "@/app/assistant";
import { AgentModelSelector } from "@/components/agent-model-selector";
import { apiFetch } from "@/lib/api-client";

export default function ChatPage() {
  const { id: projectId, phoenixProject } = useProject();
  const [selectedValue, setSelectedValue] = useState("");
  const [relayUserId, setRelayUserId] = useState<string | null>(null);

  // Auto-select first connected agent on mount
  useEffect(() => {
    apiFetch(`/api/connectors?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        const online = (data.items || []).filter((c: any) => c.status === "online");
        if (online.length > 0 && !selectedValue) {
          setSelectedValue(`relay:${online[0].userId}`);
          setRelayUserId(online[0].userId);
        }
      })
      .catch(console.error);
  }, [projectId, selectedValue]);

  const handleChange = (val: string) => {
    setSelectedValue(val);
    if (val.startsWith("relay:")) {
      setRelayUserId(val.replace("relay:", ""));
    } else {
      setRelayUserId(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-2">
        <div className="max-w-xs">
          <AgentModelSelector value={selectedValue} onChange={handleChange} projectId={projectId} />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Assistant
          project={phoenixProject}
          relayUserId={relayUserId}
          relayProjectId={relayUserId ? projectId : null}
        />
      </div>
    </div>
  );
}
