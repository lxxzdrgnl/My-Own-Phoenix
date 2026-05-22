"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

interface LastUpdatedBadgeProps {
  updatedAt: string | null;
  updatedByName: string | null;
}

function formatRelative(updatedAt: string, t: ReturnType<typeof useT>): string {
  const then = new Date(updatedAt).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t.dashboard.justNow;
  if (mins < 60) return t.dashboard.minutesAgo.replace("{n}", String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t.dashboard.hoursAgo.replace("{n}", String(hours));
  const days = Math.floor(hours / 24);
  return t.dashboard.daysAgo.replace("{n}", String(days));
}

/**
 * Shows "Updated by <name> · <relative-time>" with a tooltip for the exact
 * timestamp. Re-renders every 60s to keep the relative label fresh.
 */
export function LastUpdatedBadge({ updatedAt, updatedByName }: LastUpdatedBadgeProps) {
  const t = useT();
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(i);
  }, []);

  if (!updatedAt) return null;
  const name = updatedByName ?? t.dashboard.unknownUser;
  const label = t.dashboard.updatedBy.replace("{name}", name);
  const rel = formatRelative(updatedAt, t);
  const exact = new Date(updatedAt).toLocaleString();
  return (
    <span title={exact} className="ml-auto text-xs text-muted-foreground">
      {label} · {rel}
    </span>
  );
}
