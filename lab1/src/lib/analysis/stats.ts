export function mean(xs: readonly number[]) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/** Выборочное стандартное отклонение (n − 1). */
export function sd(xs: readonly number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: readonly number[]) {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type Series = {
  label: string;
  values: number[];
  n: number;
  mean: number;
  sd: number;
  median: number;
  min: number;
  max: number;
};

export function describe(label: string, values: number[]): Series {
  return {
    label,
    values,
    n: values.length,
    mean: mean(values),
    sd: sd(values),
    median: median(values),
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
  };
}

// Логарифм гамма-функции, приближение Ланцоша (g = 7).
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function lnGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const x0 = z - 1;
  let x = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) x += LANCZOS[i] / (x0 + i);
  const t = x0 + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x0 + 0.5) * Math.log(t) - t + Math.log(x);
}

// Цепная дробь для неполной бета-функции (метод Лентца).
function betaContinuedFraction(x: number, a: number, b: number) {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-14) break;
  }
  return h;
}

/** Регуляризованная неполная бета-функция I_x(a, b). */
export function regularizedBeta(x: number, a: number, b: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(x, a, b)) / a
    : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** Двусторонняя p-value для t-статистики Стьюдента. */
export function tTwoSidedP(t: number, df: number) {
  if (!Number.isFinite(t)) return 0;
  return regularizedBeta(df / (df + t * t), df / 2, 0.5);
}

export type PairedT = {
  n: number;
  meanDiff: number;
  sdDiff: number;
  t: number;
  df: number;
  p: number;
};

/** Парный t-критерий: у каждого участника есть значение в обоих условиях. */
export function pairedT(first: readonly number[], second: readonly number[]): PairedT | null {
  const n = Math.min(first.length, second.length);
  if (n < 2) return null;
  const diffs = first.slice(0, n).map((x, i) => x - second[i]);
  const meanDiff = mean(diffs);
  const sdDiff = sd(diffs);
  const df = n - 1;
  if (sdDiff === 0) {
    return { n, meanDiff, sdDiff, t: meanDiff === 0 ? 0 : Math.sign(meanDiff) * Infinity, df, p: meanDiff === 0 ? 1 : 0 };
  }
  const t = meanDiff / (sdDiff / Math.sqrt(n));
  return { n, meanDiff, sdDiff, t, df, p: tTwoSidedP(t, df) };
}
