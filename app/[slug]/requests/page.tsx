"use client";

import { useProject } from "@/lib/project-context";
import { ProjectView } from "@/app/projects/[name]/project-view";

export default function RequestsPage() {
  const { phoenixProject } = useProject();
  return <ProjectView projectName={phoenixProject} defaultTab="traces" />;
}
