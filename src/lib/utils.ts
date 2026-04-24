import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Pick a foreground color (#fff or #000) given a hex background, for label
 * chips and similar.
 */
export function readableTextColor(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0f172a" : "#ffffff";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * D1 + Drizzle may return timestamps as Unix seconds in JSON, or as ISO
 * strings if a Date was stringified. UI code that did `* 1000` breaks on
 * strings and can crash `date-fns` in the open-card modal.
 */
export function dateFromApiTimestamp(
  t: number | string | null | undefined,
): Date | null {
  if (t == null) return null;
  if (typeof t === "string") return new Date(t);
  if (typeof t === "number") {
    if (!Number.isFinite(t)) return null;
    return new Date(t < 1e12 ? t * 1000 : t);
  }
  return null;
}
