"use client";

import { useParams } from "next/navigation";
import { ProjectView } from "@/app/projects/[name]/project-view";

export default function OverviewPage() {
  const params = useParams<{ slug: string }>();
  return <ProjectView projectName={params.slug} defaultTab="traces" />;
}
