import { MAX_LENGTH, START_LENGTH } from "@/lib/experiment/config";
import { CONDITION_LABEL } from "@/lib/experiment/labels";
import { DIGIT_COLORS } from "@/lib/experiment/palette";
import type { Report, SpanCondition, Tally } from "./report";
import { CHART_COLOR, groupedBars, lineChart, pairedDots, stackedRows } from "./svg-charts";

/** Порядок совпадает с нумерацией: «Рисунок N» и на странице, и в PDF. */
export const FIGURE_KEYS = [
  "overview",
  "paired1",
  "position",
  "composition",
  "paired3",
  "byLength",
  "digits",
] as const;

export type FigureKey = (typeof FIGURE_KEYS)[number];

export const figureNumber = (key: FigureKey) => FIGURE_KEYS.indexOf(key) + 1;

export type Figure = { key: FigureKey; number: number; caption: string; svg: string };

const CAPTION: Record<FigureKey, string> = {
  overview:
    "Средняя наибольшая длина верно воспроизведённого ряда по условиям (столбец — среднее, усы — ±σ)",
  paired1: "Наибольшая длина ряда у каждого участника: арабские цифры и пиктограммы (тест 1)",
  position: "Доля верно воспроизведённых элементов по позиции в ряду (тест 2)",
  composition:
    "Что происходило с элементами смешанных рядов: воспроизведены верно, вид перепутан или забыты (тест 2)",
  paired3: "Наибольшая длина ряда у каждого участника: яркие и монохромные цифры (тест 3)",
  byLength: "Доля верно воспроизведённых рядов в зависимости от длины ряда (все участники)",
  digits: "Доля верно воспроизведённых элементов по значению цифры (все тесты)",
};

const rate = (t: Tally) => (t.shown ? (t.recalled / t.shown) * 100 : 0);
const rateOrNull = (t: Tally) => (t.shown ? (t.recalled / t.shown) * 100 : null);

/**
 * Собирает диаграммы отчёта. family — шрифт подписей внутри SVG: на странице это Inter,
 * в PDF — Tinos (в pdfmake имя должно совпадать с зарегистрированным шрифтом).
 */
export function buildFigures(report: Report, family: string): Partial<Record<FigureKey, Figure>> {
  const out: Partial<Record<FigureKey, Figure>> = {};
  const add = (key: FigureKey, svg: string) => {
    out[key] = { key, number: figureNumber(key), caption: CAPTION[key], svg };
  };
  const base = (key: FigureKey) => ({ title: `Рисунок ${figureNumber(key)}. ${CAPTION[key]}`, font: { family, id: key } });

  // 1. Общая картина по четырём условиям.
  const byCondition = (c: SpanCondition) => report.conditions.find((x) => x.condition === c)!.span;
  const order: SpanCondition[] = ["arabic", "picto", "colored", "mono"];
  add(
    "overview",
    groupedBars({
      ...base("overview"),
      categories: order.map((c) => CONDITION_LABEL[c]),
      series: [
        {
          name: "Средняя длина",
          color: CHART_COLOR.ink,
          values: order.map((c) => (byCondition(c).n ? byCondition(c).mean : 0)),
          errors: order.map((c) => byCondition(c).sd),
        },
      ],
      barColors: [CHART_COLOR.arabic, CHART_COLOR.picto, DIGIT_COLORS, CHART_COLOR.mono],
      yMax: MAX_LENGTH,
      yStep: 1,
      yLabel: "Длина ряда, элементов",
    }),
  );

  // 2 и 5. Индивидуальные результаты: у каждого участника пара точек.
  const labels = report.rows.map((_, i) => String(i + 1));
  add(
    "paired1",
    pairedDots({
      ...base("paired1"),
      labels,
      a: { name: "Арабские цифры", color: CHART_COLOR.arabic, marker: "circle", values: report.rows.map((r) => r.spanArabic) },
      b: { name: "Пиктограммы", color: CHART_COLOR.picto, marker: "square", hollow: true, values: report.rows.map((r) => r.spanPicto) },
      yMax: MAX_LENGTH,
      yStep: 1,
      yLabel: "Наибольшая длина ряда",
      xLabel: "Номер участника",
    }),
  );
  add(
    "paired3",
    pairedDots({
      ...base("paired3"),
      labels,
      a: { name: "Яркие цифры", color: CHART_COLOR.colored, marker: "circle", values: report.rows.map((r) => r.spanColored) },
      b: { name: "Монохромные цифры", color: CHART_COLOR.mono, marker: "square", hollow: true, values: report.rows.map((r) => r.spanMono) },
      yMax: MAX_LENGTH,
      yStep: 1,
      yLabel: "Наибольшая длина ряда",
      xLabel: "Номер участника",
    }),
  );

  // 3 и 4. Смешанные ряды: кривая по позициям и «судьба» элементов.
  const { positions } = report.charts;
  if (positions.length) {
    add(
      "position",
      lineChart({
        ...base("position"),
        xLabels: positions.map((p) => String(p.position)),
        series: [
          { name: "Арабские цифры", color: CHART_COLOR.arabic, marker: "circle", values: positions.map((p) => rateOrNull(p.a)) },
          { name: "Пиктограммы", color: CHART_COLOR.picto, marker: "square", dash: "5 3", hollow: true, values: positions.map((p) => rateOrNull(p.p)) },
        ],
        yMax: 100,
        yStep: 20,
        unit: "%",
        yLabel: "Верно воспроизведено",
        xLabel: "Позиция элемента в ряду (слева направо, сверху вниз)",
      }),
    );
  }
  const { mixed } = report;
  if (mixed) {
    const parts = (shown: number, recalled: number, swapped: number) => {
      const pct = (n: number) => (shown ? (n / shown) * 100 : 0);
      return [
        { name: "Воспроизведён верно", value: pct(recalled), color: CHART_COLOR.good },
        { name: "Вид перепутан", value: pct(swapped), color: CHART_COLOR.swapped },
        { name: "Забыт", value: Math.max(0, 100 - pct(recalled) - pct(swapped)), color: CHART_COLOR.lost, textColor: CHART_COLOR.ink },
      ];
    };
    add(
      "composition",
      stackedRows({
        ...base("composition"),
        rows: [
          { label: "Арабские цифры", parts: parts(mixed.shown.a, mixed.recalled.a, mixed.swapped.a) },
          { label: "Пиктограммы", parts: parts(mixed.shown.p, mixed.recalled.p, mixed.swapped.p) },
        ],
        xLabel: "Доля показанных элементов, %",
      }),
    );
  }

  // 6. Кривая «длина ряда → доля верных попыток».
  const lengths = Array.from({ length: MAX_LENGTH - START_LENGTH + 1 }, (_, i) => START_LENGTH + i);
  const curve = (c: SpanCondition) =>
    lengths.map((length) => {
      const cell = report.charts.lengthCurve[c].find((x) => x.length === length);
      return cell && cell.attempts ? (cell.correct / cell.attempts) * 100 : null;
    });
  add(
    "byLength",
    lineChart({
      ...base("byLength"),
      xLabels: lengths.map(String),
      series: [
        { name: CONDITION_LABEL.arabic, color: CHART_COLOR.arabic, marker: "circle", values: curve("arabic") },
        { name: CONDITION_LABEL.picto, color: CHART_COLOR.picto, marker: "square", dash: "5 3", hollow: true, values: curve("picto") },
        { name: CONDITION_LABEL.colored, color: CHART_COLOR.colored, marker: "diamond", values: curve("colored") },
        { name: CONDITION_LABEL.mono, color: CHART_COLOR.mono, marker: "triangle", dash: "2 3", hollow: true, values: curve("mono") },
      ],
      yMax: 100,
      yStep: 20,
      unit: "%",
      yLabel: "Верно воспроизведено рядов",
      xLabel: "Длина ряда, элементов",
    }),
  );

  // 7. Какие значения запоминаются лучше.
  const { digits } = report.charts;
  add(
    "digits",
    groupedBars({
      ...base("digits"),
      categories: Array.from({ length: 10 }, (_, v) => String(v)),
      series: [
        { name: "Арабские цифры", color: CHART_COLOR.arabic, values: Array.from({ length: 10 }, (_, v) => rate(digits.find((d) => d.value === v)?.a ?? { shown: 0, recalled: 0 })) },
        { name: "Пиктограммы", color: CHART_COLOR.picto, values: Array.from({ length: 10 }, (_, v) => rate(digits.find((d) => d.value === v)?.p ?? { shown: 0, recalled: 0 })) },
      ],
      yMax: 100,
      yStep: 20,
      unit: "%",
      decimals: 0,
      valueLabels: false,
      yLabel: "Верно воспроизведено",
      xLabel: "Значение цифры",
    }),
  );

  return out;
}
