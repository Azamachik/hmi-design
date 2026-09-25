import { DIGITS, type BlockOrder, type Condition, type Form, type Item } from "./types";

export type Rng = () => number;

/**
 * Детерминированный генератор (mulberry32). Его состояние хранится в сессии,
 * поэтому ход эксперимента остаётся чистой функцией и воспроизводится по зерну.
 */
export function createRng(seed: number): Rng & { readonly state: number } {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.defineProperty(next, "state", { get: () => s }) as Rng & { readonly state: number };
}

export function shuffle<T>(source: readonly T[], rng: Rng = Math.random): T[] {
  const out = source.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Три подряд идущих значения с шагом ±1 (1-2-3, 7-6-5) запоминаются одним куском. */
export function hasRun(values: readonly number[]) {
  for (let i = 2; i < values.length; i++) {
    const d1 = values[i - 1] - values[i - 2];
    const d2 = values[i] - values[i - 1];
    if (Math.abs(d1) === 1 && d1 === d2) return true;
  }
  return false;
}

function formsFor(condition: Condition, length: number, rng: Rng): Form[] {
  if (condition === "picto") return Array<Form>(length).fill("p");
  if (condition !== "mixed") return Array<Form>(length).fill("a");

  // Поровну цифр и пиктограмм; при нечётной длине лишний элемент достаётся случайному виду.
  const arabic = Math.floor(length / 2) + (length % 2 === 1 && rng() < 0.5 ? 1 : 0);
  return shuffle<Form>(
    [...Array<Form>(arabic).fill("a"), ...Array<Form>(length - arabic).fill("p")],
    rng,
  );
}

/** Значения в ряду не повторяются, поэтому каждый элемент однозначно определяется значением. */
export function makeSequence(condition: Condition, length: number, rng: Rng = Math.random): Item[] {
  let values = shuffle(DIGITS, rng).slice(0, length);
  for (let attempt = 0; attempt < 100 && hasRun(values); attempt++) {
    values = shuffle(DIGITS, rng).slice(0, length);
  }
  const forms = formsFor(condition, length, rng);
  return values.map((v, i) => ({ v, f: forms[i] }));
}

/** Порядок блоков внутри пар выбирается случайно, чтобы не смешивать условие с эффектом тренировки. */
export function makeBlockOrder(rng: Rng = Math.random): BlockOrder {
  const flip = (pair: [Condition, Condition]): Condition[] =>
    rng() < 0.5 ? pair : [pair[1], pair[0]];
  return {
    seq: flip(["picto", "arabic"]),
    color: flip(["colored", "mono"]),
  };
}
