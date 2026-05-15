"use client";

import { useProject } from "@/lib/project-context";
import { DatasetManager } from "@/app/datasets/dataset-manager";

export default function DatasetsPage() {
  const { id: projectId } = useProject();
  return (
    <div className="flex h-full">
      <DatasetManager projectId={projectId} />
    </div>
  );
}
