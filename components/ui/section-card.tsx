"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  variant?: "default" | "destructive" | "bordered";
  divider?: boolean;
  /** @deprecated use `variant` */
  headerVariant?: "default" | "destructive";
  className?: string;
}

export function SectionCard({
  title,
  description,
  children,
  actions,
  variant,
  divider,
  headerVariant,
  className,
}: SectionCardProps) {
  const effectiveVariant = variant ?? headerVariant ?? "default";
  const titleColor =
    effectiveVariant === "destructive" ? "text-[#ef4444]" : "text-muted-foreground";

  return (
    <section
      className={cn(
        effectiveVariant === "bordered" && "border rounded-lg p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="space-y-1">
          <h3
            className={cn(
              "text-[10px] font-semibold uppercase tracking-widest",
              titleColor,
            )}
          >
            {title}
          </h3>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {divider && <hr className="mb-3 border-border" />}
      {children}
    </section>
  );
}
