"use client";

import { useProjectOptional, canEdit, isOwner } from "@/lib/project-context";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface RoleGateProps {
  minRole?: "editor" | "owner";
  children: React.ReactElement;
  fallbackMessage?: string;
}

/**
 * Wraps a write-action element so viewers (or non-owners) see it disabled with a tooltip.
 * Safe to use outside ProjectProvider — renders children normally when no context is available.
 */
export function RoleGate({ minRole = "editor", children, fallbackMessage }: RoleGateProps) {
  const project = useProjectOptional();

  // Outside ProjectProvider (e.g. global settings) — always allow
  if (!project) return children;

  const allowed = minRole === "owner" ? isOwner(project.role) : canEdit(project.role);

  if (allowed) return children;

  const message = fallbackMessage ?? (minRole === "owner" ? "Owner access required" : "Editor access required");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <span className="pointer-events-none opacity-50">
            {children}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  );
}
