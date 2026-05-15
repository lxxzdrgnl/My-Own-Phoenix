"use client";

import { useProject } from "@/lib/project-context";
import { EvaluationsManager } from "@/app/evaluations/evaluations-manager";

export default function EvaluationsPage() {
  const { id: projectId, phoenixProject } = useProject();
  return <EvaluationsManager fixedProject={phoenixProject} projectId={projectId} />;
}
