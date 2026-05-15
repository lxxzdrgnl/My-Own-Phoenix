"use client";

import { useProject } from "@/lib/project-context";
import { ProjectView } from "@/app/projects/[name]/project-view";

export default function MeasurePage() {
  const { phoenixProject } = useProject();
  return <ProjectView projectName={phoenixProject} defaultTab="measure" hideTabBar />;
}
