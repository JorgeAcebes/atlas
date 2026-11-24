import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export const MONTH_NAMES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/**
 * Checks whether a date string represents "Fecha desconocida" (1900-01-01 or earlier) or is invalid.
 */
export function isUnknownDate(dateVal: string | undefined | null): boolean {
  if (!dateVal) return true;
  if (typeof dateVal === "string") {
    const trimmed = dateVal.trim();
    if (trimmed.startsWith("1900-01-01") || trimmed.startsWith("1899-12-31")) {
      return true;
    }
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return true;
  return d.getFullYear() <= 1900;
}

/**
 * Parses a YYYY-MM-DD (or ISO) string safely at local noon to avoid UTC midnight day shifts.
 */
export function parseLocalNoonDate(dateVal: string | undefined | null): Date | null {
  if (!dateVal) return null;
  const trimmed = typeof dateVal === "string" ? dateVal.split("T")[0].trim() : "";
  const parts = trimmed.split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      const d = new Date(year, month, day, 12, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }
  const fallback = new Date(dateVal);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Formats a YYYY-MM-DD date string for panel detail display ("Fecha desconocida" fallback).
 */
export function formatDate(date: string): string {
  if (date === "1900-01-01" || isUnknownDate(date)) return "Fecha desconocida";
  const parsed = parseLocalNoonDate(date);
  if (!parsed) return "Fecha desconocida";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

/**
 * Formats a known activity date as "d MMM yyyy" in Spanish, returning "" for unknown dates.
 */
export function formatCustomDate(dateVal: string | undefined | null): string {
  if (!dateVal || isUnknownDate(dateVal)) return "";
  const d = parseLocalNoonDate(dateVal);
  if (!d) return "";
  return format(d, "d MMM yyyy", { locale: es });
}

/**
 * Formats a date or start/end range cleanly without duplicating identical dates.
 */
export function formatRecordDateRange(
  startDateVal: string | undefined | null,
  endDateVal: string | undefined | null
): string {
  const startStr = formatCustomDate(startDateVal);
  if (!startStr) return "";
  if (endDateVal && !isUnknownDate(endDateVal) && endDateVal !== startDateVal) {
    const endStr = formatCustomDate(endDateVal);
    if (endStr && endStr !== startStr) {
      return `${startStr} - ${endStr}`;
    }
  }
  return startStr;
}

/**
 * Formats a timestamp relative to now in Spanish.
 */
export function formatDateSafe(dateVal: string | undefined | null): string {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return "";
  try {
    return formatDistanceToNow(d, { addSuffix: true, locale: es });
  } catch {
    return "";
  }
}
