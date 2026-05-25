"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Size = "narrow" | "default" | "wide";

const SIZE_CLASS: Record<Size, string> = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
};

export function PageContainer({
  size = "default",
  children,
  className,
}: {
  size?: Size;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto px-6 py-6 space-y-6", SIZE_CLASS[size], className)}>
      {children}
    </div>
  );
}
