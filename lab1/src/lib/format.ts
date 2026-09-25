import type { Item } from "@/lib/experiment/types";

/** Десятичная запятая и настоящий минус: 6.5 → «6,5», −0.5 → «−0,5». */
export function num(x: number, digits = 1) {
  return x.toFixed(digits).replace(".", ",").replace("-", "−");
}

export function percent(x: number) {
  return `${num(x, 0)}%`;
}

export function pValue(p: number) {
  return p < 0.001 ? "< 0,001" : num(p, 3);
}

export function formatP(p: number) {
  return p < 0.001 ? "p < 0,001" : `p = ${num(p, 3)}`;
}

/** Ряд одной строкой: «7a 5p 3a» (a — цифра, p — пиктограмма). */
export function itemsToText(items: readonly Item[]) {
  return items.map((i) => `${i.v}${i.f}`).join(" ");
}

export function formatDate(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}
