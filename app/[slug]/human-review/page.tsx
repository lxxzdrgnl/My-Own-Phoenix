"use client";

import { useProject } from "@/lib/project-context";
import { HumanReviewView } from "./human-review-view";

export default function HumanReviewPage() {
  const { phoenixProject, id, slug } = useProject();
  return <HumanReviewView phoenixProject={phoenixProject} projectId={id} slug={slug} />;
}
