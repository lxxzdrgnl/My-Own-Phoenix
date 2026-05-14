"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowUpRight, FolderOpen } from "lucide-react";

interface ProjectCardProps {
  name: string;
  slug: string;
  role: string;
  createdAt: string;
}

export function ProjectCard({ name, slug, role, createdAt }: ProjectCardProps) {
  return (
    <Link
      href={`/${slug}/dashboard`}
      className="group relative block rounded-xl border border-border/60 bg-card p-5 transition-all duration-200 hover:border-border hover:shadow-lg hover:shadow-black/[0.03]"
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/5">
            <FolderOpen className="h-4 w-4 text-foreground/60" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">{name}</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground/0 transition-all group-hover:text-muted-foreground/60" />
      </div>
      <div className="flex items-center justify-between">
        <span className={cn(
          "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
          role === "owner" ? "bg-foreground text-background" :
          role === "editor" ? "bg-foreground/5 text-foreground/60" :
          "bg-muted text-muted-foreground"
        )}>
          {role}
        </span>
      </div>
    </Link>
  );
}
