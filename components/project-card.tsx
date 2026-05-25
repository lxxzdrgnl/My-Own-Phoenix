"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowUpRight, FolderOpen, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { Text } from "@/components/ui/typography";

interface ProjectCardProps {
  name: string;
  slug: string;
  role: string;
  createdAt: string;
  onRename?: (newName: string) => void;
}

export function ProjectCard({ name, slug, role, createdAt, onRename }: ProjectCardProps) {
  const { locale, t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) {
      onRename?.(trimmed);
    } else {
      setEditValue(name);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="group relative block rounded-xl border border-border/60 bg-card p-5 transition-all duration-200">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/5">
              <FolderOpen className="h-4 w-4 text-foreground/60" />
            </div>
            <div className="flex-1">
              <form
                onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
              >
                <Input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setEditValue(name);
                      setEditing(false);
                    }
                  }}
                  className="h-7 text-sm font-semibold"
                />
              </form>
              <Text variant="caption" className="mt-0.5 text-[11px]">
                {new Date(createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: locale === "ko" ? "long" : "short", day: "numeric" })}
              </Text>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            role === "owner" ? "bg-foreground text-background" :
            role === "editor" ? "bg-foreground/5 text-foreground/60" :
            "bg-muted text-muted-foreground"
          )}>
            {role === "owner" ? t.projects.owner : role === "editor" ? t.projects.editor : t.projects.viewer}
          </span>
        </div>
      </div>
    );
  }

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
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold tracking-tight">{name}</h3>
              {onRename && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditValue(name);
                    setEditing(true);
                  }}
                  className="rounded-md p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
                  title={t.projectCard.renameProject}
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {new Date(createdAt).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: locale === "ko" ? "long" : "short", day: "numeric" })}
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
