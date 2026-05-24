"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Gap = "xs" | "sm" | "md" | "lg" | "xl";

const GAP_CLASS: Record<Gap, string> = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

export function Stack({
  gap = "md",
  children,
  className,
  as = "div",
}: {
  gap?: Gap;
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  const Tag = as;
  return <Tag className={cn("flex flex-col", GAP_CLASS[gap], className)}>{children}</Tag>;
}

export function Inline({
  gap = "sm",
  align = "center",
  children,
  className,
}: {
  gap?: Gap;
  align?: "start" | "center" | "end" | "baseline";
  children: React.ReactNode;
  className?: string;
}) {
  const alignClass = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
    baseline: "items-baseline",
  }[align];
  return (
    <div className={cn("flex flex-row", GAP_CLASS[gap], alignClass, className)}>
      {children}
    </div>
  );
}
