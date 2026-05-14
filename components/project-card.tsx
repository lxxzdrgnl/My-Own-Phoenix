"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

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
      className="group block rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold tracking-tight truncate">{name}</h3>
        <span className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
          role === "owner" ? "bg-foreground text-background" :
          role === "editor" ? "bg-foreground/10 text-foreground/70" :
          "bg-muted text-muted-foreground"
        )}>
          {role}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Created {new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </p>
    </Link>
  );
}
