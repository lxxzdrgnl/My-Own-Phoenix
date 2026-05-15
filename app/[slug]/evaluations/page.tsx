"use client";

import { useProject } from "@/lib/project-context";
import { EvaluationsManager } from "@/app/evaluations/evaluations-manager";

export default function EvaluationsPage() {
  const { phoenixProject } = useProject();
  return <EvaluationsManager fixedProject={phoenixProject} />;
}
