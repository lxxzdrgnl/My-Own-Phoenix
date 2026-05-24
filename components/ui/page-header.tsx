"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Heading, Text } from "./typography";

interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: Crumb[];
  className?: string;
}) {
  return (
    <header className={cn("space-y-2", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="text-xs text-muted-foreground flex items-center gap-1">
          {breadcrumb.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span>/</span>}
              {c.href ? (
                <Link href={c.href} className="hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Heading level="page">{title}</Heading>
          {description && <Text variant="lead">{description}</Text>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
