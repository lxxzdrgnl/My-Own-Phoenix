"use client";

import { useProject } from "@/lib/project-context";
import { PromptsManager } from "@/app/prompts/prompts-manager";

export default function ScopedPromptsPage() {
  const { id: projectId } = useProject();
  return <PromptsManager projectId={projectId} />;
}
