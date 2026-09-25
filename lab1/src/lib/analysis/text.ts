import { CONDITION_LABEL } from "@/lib/experiment/labels";
import { formatP, num, percent } from "@/lib/format";
import type { Comparison, HypothesisStatus, Report, Verdict } from "./report";

export const HYPOTHESIS_1 = "Арабские цифры воспринимаются лучше пиктограмм";
export const HYPOTHESIS_2 = "Яркие арабские цифры воспринимаются лучше тёмных";

export type Tone = "good" | "neutral" | "bad";

export const VERDICT_TEXT: Record<Verdict, { label: string; tone: Tone }> = {
  confirmed: { label: "Подтверждается", tone: "good" },
  trend: { label: "Скорее подтверждается", tone: "good" },
  equal: { label: "Различий нет", tone: "neutral" },
  "opposite-trend": { label: "Скорее не подтверждается", tone: "bad" },
  opposite: { label: "Не подтверждается", tone: "bad" },
  "no-data": { label: "Нет данных", tone: "neutral" },
};

export const STATUS_TEXT: Record<HypothesisStatus, { label: string; tone: Tone }> = {
  confirmed: { label: "Подтверждается", tone: "good" },
  partial: { label: "Подтверждается частично", tone: "neutral" },
  rejected: { label: "Не подтверждается", tone: "bad" },
  "no-data": { label: "Нет данных", tone: "neutral" },
};

const unitOf = (c: Comparison) => (c.unit === "%" ? "%" : "");

/** Пояснение к вердикту: значима ли разница и что это значит. */
export function verdictNote(c: Comparison) {
  if (c.verdict === "no-data") return "Нужны участники, прошедшие оба условия.";
  if (!c.t) return "Один участник: значимость оценить нельзя.";
  const significant = c.t.p < 0.05;
  if (c.verdict === "equal") return "Средние совпадают.";
  return significant
    ? "Различие статистически значимо (p < 0,05)."
    : "Различие статистически не значимо (p ≥ 0,05): данных пока мало.";
}

export function comparisonLine(c: Comparison) {
  const fmt = (s: Comparison["favored"]) =>
    `${num(s.mean)}${unitOf(c)} ± ${num(s.sd)}`;
  const stat = c.t
    ? `; Δ = ${num(c.t.meanDiff)}, t(${c.t.df}) = ${Number.isFinite(c.t.t) ? num(c.t.t, 2) : "∞"}, ${formatP(c.t.p)}`
    : "";
  return (
    `${c.favored.label} ${fmt(c.favored)}, ${c.other.label.toLowerCase()} ${fmt(c.other)} ` +
    `(n = ${c.favored.n}${stat}); лучше у ${c.wins}, хуже у ${c.losses}, поровну у ${c.ties}`
  );
}

/** Сводка обычным текстом — её удобно вставить в отчёт. */
export function formatReportText(report: Report) {
  const { h1, h2 } = report;
  const lines = [
    "Сводка ЛР 1 · арабские цифры и пиктограммы, цветовое кодирование",
    `Участников: ${report.participants}`,
    "",
    `ГИПОТЕЗА 1. ${HYPOTHESIS_1} — ${STATUS_TEXT[h1.status].label.toLowerCase()}`,
    `${h1.seq.title}: ${comparisonLine(h1.seq)} — ${VERDICT_TEXT[h1.seq.verdict].label.toLowerCase()}`,
    `${h1.mixed.title}: ${comparisonLine(h1.mixed)} — ${VERDICT_TEXT[h1.mixed.verdict].label.toLowerCase()}`,
    "",
    `ГИПОТЕЗА 2. ${HYPOTHESIS_2} — ${STATUS_TEXT[h2.status].label.toLowerCase()}`,
    `${h2.color.title}: ${comparisonLine(h2.color)} — ${VERDICT_TEXT[h2.color.verdict].label.toLowerCase()}`,
    "",
    "ДЛИНА ВОСПРОИЗВЕДЁННОГО РЯДА (среднее ± σ, медиана, мин–макс)",
    ...report.conditions.map(
      (c) =>
        `${CONDITION_LABEL[c.condition]}: ${num(c.span.mean)} ± ${num(c.span.sd)}, Ме ${num(c.span.median)}, ${c.span.min}–${c.span.max}; на своих местах ${percent(c.accuracy)}; ответ ${num(c.answerSec)} с`,
    ),
  ];
  if (report.mixed) {
    const m = report.mixed;
    const rate = (hit: number, of: number) => percent(of ? (hit / of) * 100 : 0);
    lines.push(
      "",
      "СМЕШАННЫЕ РЯДЫ",
      `Верно воспроизведено: цифр ${m.recalled.a} из ${m.shown.a} (${rate(m.recalled.a, m.shown.a)}), пиктограмм ${m.recalled.p} из ${m.shown.p} (${rate(m.recalled.p, m.shown.p)})`,
      `В ответах набрано: цифр ${m.inAnswer.a}, пиктограмм ${m.inAnswer.p}`,
      `Вид перепутан: цифра → пиктограмма ${m.swapped.a}, пиктограмма → цифра ${m.swapped.p}`,
    );
  }
  return lines.join("\n");
}
