import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** `${prefix}${sep}${timestamp}${sep}${random6}` — collision-safe short id */
export function generateId(prefix: string, sep: "-" | "_" = "-"): string {
  return `${prefix}${sep}${Date.now()}${sep}${Math.random().toString(36).slice(2, 8)}`;
}
