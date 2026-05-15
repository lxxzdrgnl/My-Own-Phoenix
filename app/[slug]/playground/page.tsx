"use client";

import { useProject } from "@/lib/project-context";
import { Playground } from "@/app/playground/playground";

export default function PlaygroundPage() {
  const { phoenixProject } = useProject();
  return <Playground fixedProject={phoenixProject} />;
}
