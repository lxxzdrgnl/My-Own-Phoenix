"use client";

import { useProject } from "@/lib/project-context";
import { Assistant } from "@/app/assistant";

export default function ChatPage() {
  const { phoenixProject } = useProject();

  return (
    <div className="h-full">
      <Assistant project={phoenixProject} />
    </div>
  );
}
