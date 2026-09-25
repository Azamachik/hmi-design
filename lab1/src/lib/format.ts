import type { Item } from "@/lib/experiment/types";

/** Десятичная запятая и настоящий минус: 6.5 → «6,5», −0.5 → «−0,5». */
export function num(x: number, digits = 1) {
  return x.toFixed(digits).replace(".", ",").replace("-", "−");
}

/** Русское склонение по числу: plural(2, ["участник", "участника", "участников"]) → «участника». */
export function plural(n: number, forms: [one: string, few: string, many: string]) {
  const last2 = Math.abs(n) % 100;
  const last = last2 % 10;
  if (last2 >= 11 && last2 <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
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
