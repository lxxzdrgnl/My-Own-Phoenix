"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type HeadingLevel = "page" | "section" | "sub";

const HEADING_CLASS: Record<HeadingLevel, string> = {
  page: "text-2xl font-semibold tracking-tight",
  section: "text-lg font-semibold",
  sub: "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
};

const HEADING_DEFAULT_TAG: Record<HeadingLevel, "h1" | "h2" | "h3"> = {
  page: "h1",
  section: "h2",
  sub: "h3",
};

export function Heading({
  level,
  children,
  className,
  as,
}: {
  level: HeadingLevel;
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}) {
  const Tag = as ?? HEADING_DEFAULT_TAG[level];
  return <Tag className={cn(HEADING_CLASS[level], className)}>{children}</Tag>;
}

type TextVariant = "body" | "caption" | "mono" | "lead";

const TEXT_CLASS: Record<TextVariant, string> = {
  body: "text-sm",
  caption: "text-xs text-muted-foreground",
  mono: "font-mono text-xs",
  lead: "text-base text-muted-foreground",
};

export function Text({
  variant = "body",
  children,
  className,
  as,
}: {
  variant?: TextVariant;
  children: React.ReactNode;
  className?: string;
  as?: "p" | "span" | "div";
}) {
  const Tag = as ?? "p";
  return <Tag className={cn(TEXT_CLASS[variant], className)}>{children}</Tag>;
}

export function Label({
  children,
  required,
  htmlFor,
  className,
}: {
  children: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("text-xs font-medium block", className)}>
      {children}
      {required && <span className="text-[#ef4444] ml-0.5">*</span>}
    </label>
  );
}
