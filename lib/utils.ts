import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** `${prefix}${sep}${timestamp}${sep}${random6}` — collision-safe short id */
export function generateId(prefix: string, sep: "-" | "_" = "-"): string {
  return `${prefix}${sep}${Date.now()}${sep}${Math.random().toString(36).slice(2, 8)}`;
}

/** `dldydwo9@gmail.com` → `dld***@gmail.com` — keep first 3 chars of local part, mask the rest, preserve domain */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, 3)}***${domain}`;
}
