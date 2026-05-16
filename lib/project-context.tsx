"use client";

import { createContext, useContext } from "react";

interface ProjectContextValue {
  id: string;
  slug: string;
  name: string;
  phoenixProject: string;
  role: "owner" | "editor" | "viewer";
}

/** Convenience helpers */
export function canEdit(role: string) { return role === "owner" || role === "editor"; }
export function isOwner(role: string) { return role === "owner"; }

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({
  value,
  children,
}: {
  value: ProjectContextValue;
  children: React.ReactNode;
}) {
  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

/** Like useProject but returns null when outside ProjectProvider instead of throwing. */
export function useProjectOptional(): ProjectContextValue | null {
  return useContext(ProjectContext);
}
