"use client";

import { useState } from "react";
import { useProject } from "@/lib/project-context";
import { Assistant } from "@/app/assistant";
import { AgentSelector } from "@/components/agent-selector";

export default function ChatPage() {
  const { phoenixProject } = useProject();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <div className="max-w-xs">
          <AgentSelector selected={selectedAgent} onSelect={setSelectedAgent} />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Assistant project={phoenixProject} />
      </div>
    </div>
  );
}
