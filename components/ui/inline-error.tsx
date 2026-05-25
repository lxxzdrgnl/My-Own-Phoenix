"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function InlineError({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("text-sm text-[#ef4444]", className)}>
      {children}
    </p>
  );
}
