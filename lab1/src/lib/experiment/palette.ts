import type { Condition, Item } from "./types";

/** Тёмный «чернильный» цвет для монохромных цифр и пиктограмм. */
export const INK = "#1c1917";

/**
 * Яркие цвета для цифр 0–9 в порядке радуги. Каждый держит контраст не ниже 3:1
 * на белом фоне (крупный текст по WCAG), поэтому яркость не подменяет читаемость.
 */
export const DIGIT_COLORS = [
  "#e11d48",
  "#ea580c",
  "#d97706",
  "#65a30d",
  "#16a34a",
  "#0d9488",
  "#0284c7",
  "#2563eb",
  "#7c3aed",
  "#c026d3",
] as const;

export function glyphColor(item: Item, condition: Condition) {
  return condition === "colored" && item.f === "a" ? DIGIT_COLORS[item.v] : INK;
}
