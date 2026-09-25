import { num } from "@/lib/format";

/**
 * Диаграммы отдаются строкой SVG: одну и ту же разметку показывает страница результатов
 * и вставляет в PDF pdfmake, поэтому здесь только простые примитивы (линии, прямоугольники,
 * текст с явной базовой линией) — всё, что понимает svg-to-pdfkit.
 */

export const CHART_COLOR = {
  ink: "#1c1917",
  text: "#44403c",
  muted: "#78716c",
  grid: "#e7e5e4",
  axis: "#a8a29e",
  arabic: "#1c1917",
  picto: "#ea580c",
  colored: "#2563eb",
  mono: "#78716c",
  good: "#15803d",
  swapped: "#d97706",
  lost: "#d6d3d1",
} as const;

export type ChartFont = { family: string; id: string };

const WIDTH = 520;
const FONT_SIZE = 12;

const r2 = (n: number) => Math.round(n * 100) / 100;

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Грубая оценка ширины текста: точных метрик шрифта в SVG нет, хватает для подписей и легенды. */
const textWidth = (s: string, size = FONT_SIZE) => s.length * size * 0.5;

/** Делит подпись на строки не длиннее max символов по пробелам. */
function wrap(label: string, max: number) {
  const words = label.split(" ");
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + word).length <= max) lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
  }
  return lines;
}

type TextOptions = {
  size?: number;
  anchor?: "start" | "middle" | "end";
  bold?: boolean;
  fill?: string;
  rotate?: number;
};

class Canvas {
  private body: string[] = [];
  private defs: string[] = [];

  constructor(
    readonly height: number,
    private readonly font: ChartFont,
    private readonly title: string,
  ) {}

  text(x: number, y: number, s: string, o: TextOptions = {}) {
    const rotate = o.rotate ? ` transform="rotate(${o.rotate} ${r2(x)} ${r2(y)})"` : "";
    this.body.push(
      `<text x="${r2(x)}" y="${r2(y)}" font-size="${o.size ?? FONT_SIZE}" text-anchor="${o.anchor ?? "start"}" ` +
        `fill="${o.fill ?? CHART_COLOR.text}"${o.bold ? ' font-weight="bold"' : ""}${rotate}>${escapeXml(s)}</text>`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke: string, width = 1, dash?: string) {
    this.body.push(
      `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`,
    );
  }

  rect(x: number, y: number, w: number, h: number, fill: string, rx = 0, stroke?: string) {
    if (w <= 0 || h <= 0) return;
    this.body.push(
      `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="${rx}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="1.4"` : ""}/>`,
    );
  }

  path(d: string, stroke: string, width = 2, dash?: string) {
    this.body.push(
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`,
    );
  }

  /** Заливка: цвет или градиент слева направо (для радужных «ярких» цифр). */
  fill(colors: string | readonly string[], key: string) {
    if (typeof colors === "string") return colors;
    const id = `${this.font.id}-${key}`;
    if (!this.defs.some((d) => d.includes(`id="${id}"`))) {
      const stops = colors
        .map((c, i) => `<stop offset="${r2((i / (colors.length - 1)) * 100)}%" stop-color="${c}"/>`)
        .join("");
      this.defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>`);
    }
    return `url(#${id})`;
  }

  marker(kind: Marker, x: number, y: number, color: string, filled = true) {
    const fill = filled ? color : "#ffffff";
    const stroke = `stroke="${color}" stroke-width="1.6"`;
    if (kind === "circle") {
      this.body.push(`<circle cx="${r2(x)}" cy="${r2(y)}" r="4" fill="${fill}" ${stroke}/>`);
    } else if (kind === "square") {
      this.body.push(`<rect x="${r2(x - 3.6)}" y="${r2(y - 3.6)}" width="7.2" height="7.2" fill="${fill}" ${stroke}/>`);
    } else if (kind === "diamond") {
      this.body.push(
        `<path d="M${r2(x)} ${r2(y - 5)} L${r2(x + 5)} ${r2(y)} L${r2(x)} ${r2(y + 5)} L${r2(x - 5)} ${r2(y)} Z" fill="${fill}" ${stroke}/>`,
      );
    } else {
      this.body.push(
        `<path d="M${r2(x)} ${r2(y - 5)} L${r2(x + 5)} ${r2(y + 4)} L${r2(x - 5)} ${r2(y + 4)} Z" fill="${fill}" ${stroke}/>`,
      );
    }
  }

  toString() {
    const style = `font-family:${this.font.family}`;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${this.height}" width="${WIDTH}" height="${this.height}" ` +
      `font-family="${escapeXml(this.font.family)}" style="${escapeXml(style)}" role="img" aria-label="${escapeXml(this.title)}">` +
      `<title>${escapeXml(this.title)}</title>` +
      (this.defs.length ? `<defs>${this.defs.join("")}</defs>` : "") +
      this.body.join("") +
      `</svg>`
    );
  }
}

export type Marker = "circle" | "square" | "diamond" | "triangle";

type LegendItem = { name: string; color: string; marker?: Marker; kind: "box" | "line" | "dot"; dash?: string; hollow?: boolean };

/** Легенда по центру над областью построения. Возвращает занятую высоту. */
function legend(c: Canvas, items: LegendItem[], y: number) {
  const gap = 22;
  const widths = items.map((it) => 20 + textWidth(it.name));
  const total = widths.reduce((s, w) => s + w, 0) + gap * (items.length - 1);
  let x = Math.max(8, (WIDTH - total) / 2);
  items.forEach((it, i) => {
    if (it.kind === "box") {
      c.rect(x, y - 9, 11, 11, it.color);
    } else {
      c.line(x - 2, y - 3.5, x + 14, y - 3.5, it.color, 2, it.dash);
      c.marker(it.marker ?? "circle", x + 6, y - 3.5, it.color, !it.hollow);
    }
    c.text(x + 20, y, it.name);
    x += widths[i] + gap;
  });
  return 26;
}

type Plot = { left: number; right: number; top: number; bottom: number };

function yAxis(c: Canvas, plot: Plot, yMax: number, step: number, label: string, unit = "") {
  for (let v = 0; v <= yMax + 1e-9; v += step) {
    const y = plot.bottom - (v / yMax) * (plot.bottom - plot.top);
    c.line(plot.left, y, plot.right, y, v === 0 ? CHART_COLOR.axis : CHART_COLOR.grid, v === 0 ? 1.2 : 1);
    c.text(plot.left - 7, y + 4, `${num(v, step < 1 ? 1 : 0)}${unit}`, { anchor: "end", size: 11, fill: CHART_COLOR.muted });
  }
  c.text(16, (plot.top + plot.bottom) / 2, label, { anchor: "middle", rotate: -90, size: 11.5, fill: CHART_COLOR.muted });
}

const yPos = (plot: Plot, v: number, yMax: number) =>
  plot.bottom - (Math.min(Math.max(v, 0), yMax) / yMax) * (plot.bottom - plot.top);

type Base = { title: string; font: ChartFont };

type Axis = { yMax: number; yStep: number; yLabel: string; unit?: string };

export type BarSeries = {
  name: string;
  color: string;
  values: number[];
  /** Полуразмах усов (σ) для каждого столбца; можно не задавать. */
  errors?: number[];
};

/** Столбцы, сгруппированные по категориям. Один ряд — цвет можно задать каждому столбцу отдельно. */
export function groupedBars(
  o: Base &
    Axis & {
      categories: string[];
      series: BarSeries[];
      /** Цвет или градиент для каждого столбца (для одного ряда). */
      barColors?: (string | readonly string[])[];
      decimals?: number;
      /** Подписи значений над столбцами; для частых категорий их лучше отключить. */
      valueLabels?: boolean;
      xLabel?: string;
    },
) {
  const height = 300;
  const c = new Canvas(height, o.font, o.title);
  const showLegend = o.series.length > 1;
  const top = showLegend ? legend(c, o.series.map((s) => ({ name: s.name, color: s.color, kind: "box" as const })), 16) + 8 : 14;
  const plot: Plot = { left: 58, right: WIDTH - 14, top, bottom: height - 62 };
  yAxis(c, plot, o.yMax, o.yStep, o.yLabel, o.unit);

  const groupW = (plot.right - plot.left) / o.categories.length;
  const barW = Math.min(46, (groupW * 0.72) / o.series.length);
  o.categories.forEach((category, gi) => {
    const groupX = plot.left + groupW * gi + (groupW - barW * o.series.length) / 2;
    o.series.forEach((s, si) => {
      const v = s.values[gi] ?? 0;
      const x = groupX + barW * si;
      const y = yPos(plot, v, o.yMax);
      const colors = o.barColors && o.series.length === 1 ? o.barColors[gi] : s.color;
      c.rect(x + 1.5, y, barW - 3, plot.bottom - y, c.fill(colors, `bar${gi}`), 2);
      const err = s.errors?.[gi];
      if (err && err > 0) {
        const cx = x + barW / 2;
        const hi = yPos(plot, v + err, o.yMax);
        const lo = yPos(plot, v - err, o.yMax);
        c.line(cx, hi, cx, lo, CHART_COLOR.ink, 1.3);
        c.line(cx - 4, hi, cx + 4, hi, CHART_COLOR.ink, 1.3);
        c.line(cx - 4, lo, cx + 4, lo, CHART_COLOR.ink, 1.3);
      }
      if (o.valueLabels !== false) {
        const labelY = Math.min(y, err ? yPos(plot, v + err, o.yMax) : y) - 5;
        c.text(x + barW / 2, labelY, `${num(v, o.decimals ?? 1)}${o.unit ?? ""}`, { anchor: "middle", size: 11, bold: true, fill: CHART_COLOR.ink });
      }
    });
    wrap(category, groupW > 110 ? 20 : 12).forEach((line, li) =>
      c.text(plot.left + groupW * gi + groupW / 2, plot.bottom + 17 + li * 13.5, line, { anchor: "middle", size: 11.5 }),
    );
  });
  if (o.xLabel) c.text((plot.left + plot.right) / 2, height - 6, o.xLabel, { anchor: "middle", size: 11.5, fill: CHART_COLOR.muted });
  return c.toString();
}

export type DotSeries = { name: string; color: string; marker: Marker; hollow?: boolean; values: (number | null)[] };

/** Результаты каждого участника в двух условиях: две точки на одной вертикали, соединённые линией. */
export function pairedDots(o: Base & Axis & { labels: string[]; a: DotSeries; b: DotSeries; xLabel: string }) {
  const height = 290;
  const c = new Canvas(height, o.font, o.title);
  const top = legend(
    c,
    [o.a, o.b].map((s) => ({ name: s.name, color: s.color, marker: s.marker, kind: "dot" as const, hollow: s.hollow })),
    16,
  ) + 8;
  const plot: Plot = { left: 58, right: WIDTH - 14, top, bottom: height - 46 };
  yAxis(c, plot, o.yMax, o.yStep, o.yLabel, o.unit);

  const n = Math.max(1, o.labels.length);
  const stepX = (plot.right - plot.left) / n;
  const every = Math.ceil(n / 18);
  o.labels.forEach((label, i) => {
    const x = plot.left + stepX * (i + 0.5);
    const va = o.a.values[i];
    const vb = o.b.values[i];
    if (va != null && vb != null) c.line(x, yPos(plot, va, o.yMax), x, yPos(plot, vb, o.yMax), CHART_COLOR.axis, 1.4);
    if (va != null) c.marker(o.a.marker, x, yPos(plot, va, o.yMax), o.a.color, !o.a.hollow);
    if (vb != null) c.marker(o.b.marker, x, yPos(plot, vb, o.yMax), o.b.color, !o.b.hollow);
    if (i % every === 0) c.text(x, plot.bottom + 15, label, { anchor: "middle", size: 11 });
  });
  c.text((plot.left + plot.right) / 2, height - 6, o.xLabel, { anchor: "middle", size: 11.5, fill: CHART_COLOR.muted });
  return c.toString();
}

export type LineSeries = {
  name: string;
  color: string;
  marker: Marker;
  dash?: string;
  hollow?: boolean;
  values: (number | null)[];
};

/** Линии по общим категориям оси X; пропуски (null) разрывают линию. */
export function lineChart(o: Base & Axis & { xLabels: string[]; series: LineSeries[]; xLabel: string }) {
  const height = 300;
  const c = new Canvas(height, o.font, o.title);
  const top = legend(
    c,
    o.series.map((s) => ({ name: s.name, color: s.color, marker: s.marker, kind: "line" as const, dash: s.dash, hollow: s.hollow })),
    16,
  ) + 8;
  const plot: Plot = { left: 58, right: WIDTH - 20, top, bottom: height - 46 };
  yAxis(c, plot, o.yMax, o.yStep, o.yLabel, o.unit);

  const n = o.xLabels.length;
  const xAt = (i: number) => plot.left + ((plot.right - plot.left) * (i + 0.5)) / n;
  o.xLabels.forEach((label, i) => c.text(xAt(i), plot.bottom + 16, label, { anchor: "middle", size: 11.5 }));

  for (const s of o.series) {
    let d = "";
    let pen = false; // false — следующая точка начинает новый отрезок
    s.values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${r2(xAt(i))} ${r2(yPos(plot, v, o.yMax))} `;
      pen = true;
    });
    if (d) c.path(d.trim(), s.color, 2, s.dash);
    s.values.forEach((v, i) => v != null && c.marker(s.marker, xAt(i), yPos(plot, v, o.yMax), s.color, !s.hollow));
  }
  c.text((plot.left + plot.right) / 2, height - 6, o.xLabel, { anchor: "middle", size: 11.5, fill: CHART_COLOR.muted });
  return c.toString();
}

export type StackRow = { label: string; parts: { name: string; value: number; color: string; textColor?: string }[] };

/** Горизонтальные полосы, составленные из долей (в сумме 100%). */
export function stackedRows(o: Base & { rows: StackRow[]; xLabel: string }) {
  const rowH = 40;
  const gap = 18;
  const legendItems = o.rows[0]?.parts ?? [];
  const height = 26 + o.rows.length * (rowH + gap) + 46;
  const c = new Canvas(height, o.font, o.title);
  const top = legend(c, legendItems.map((p) => ({ name: p.name, color: p.color, kind: "box" as const })), 16) + 6;
  const left = 132;
  const right = WIDTH - 16;
  const w = right - left;

  o.rows.forEach((row, ri) => {
    const y = top + ri * (rowH + gap);
    c.text(left - 10, y + rowH / 2 + 4, row.label, { anchor: "end", size: 12 });
    let x = left;
    for (const part of row.parts) {
      const pw = (Math.max(0, part.value) / 100) * w;
      c.rect(x, y, pw, rowH, part.color);
      if (pw > 34) c.text(x + pw / 2, y + rowH / 2 + 4, `${num(part.value, 0)}%`, { anchor: "middle", size: 12, bold: true, fill: part.textColor ?? "#ffffff" });
      x += pw;
    }
  });
  const axisY = top + o.rows.length * (rowH + gap) - gap + 8;
  c.line(left, axisY, right, axisY, CHART_COLOR.axis, 1.2);
  for (let v = 0; v <= 100; v += 20) {
    const x = left + (v / 100) * w;
    c.line(x, axisY, x, axisY + 4, CHART_COLOR.axis, 1.2);
    c.text(x, axisY + 17, `${v}%`, { anchor: "middle", size: 11, fill: CHART_COLOR.muted });
  }
  c.text((left + right) / 2, height - 6, o.xLabel, { anchor: "middle", size: 11.5, fill: CHART_COLOR.muted });
  return c.toString();
}
