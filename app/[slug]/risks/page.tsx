"use client";

import { useParams } from "next/navigation";
import { ProjectView } from "@/app/projects/[name]/project-view";

export default function RisksPage() {
  const params = useParams<{ slug: string }>();
  return <ProjectView projectName={params.slug} defaultTab="risk" />;
}
