import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeFormatDate(dateVal: any, formatStr: string, options?: any, fallback = '-'): string {
  if (!dateVal) return fallback;
  try {
    const d = typeof dateVal === 'string' ? parseISO(dateVal) : (dateVal instanceof Date ? dateVal : new Date(dateVal));
    if (isNaN(d.getTime())) return fallback;
    return format(d, formatStr, options);
  } catch {
    return fallback;
  }
}

export function safeParseDate(dateVal: any): Date | null {
  if (!dateVal) return null;
  try {
    const d = typeof dateVal === 'string' ? parseISO(dateVal) : (dateVal instanceof Date ? dateVal : new Date(dateVal));
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}
