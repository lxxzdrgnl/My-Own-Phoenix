import { apiFetch } from "@/lib/api-client";
import { logger } from "@/lib/logger";
import type { Project } from "./types";

export async function fetchProjects(): Promise<Project[]> {
  const res = await apiFetch("/api/v1/projects");
  const data = await res.json();
  const projects = (data.data ?? []).map((p: any) => ({ id: p.name, name: p.name }));

  // Apply saved order from localStorage (client-side only)
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("project_order");
      if (saved) {
        const order: string[] = JSON.parse(saved);
        projects.sort((a: Project, b: Project) => {
          const ai = order.indexOf(a.name);
          const bi = order.indexOf(b.name);
          if (ai === -1 && bi === -1) return 0;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
      }
    } catch (e) { logger.error("fetchProjects localStorage parse failed", e); }
  }
  return projects;
}
