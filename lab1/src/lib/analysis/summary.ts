import { isExact, placedCount, sameItem } from "@/lib/experiment/scoring";
import type { Condition, TrialRecord } from "@/lib/experiment/types";

export type FormCounts = { a: number; p: number };

const zero = (): FormCounts => ({ a: 0, p: 0 });

export type SpanSummary = {
  /** Самый длинный верно воспроизведённый ряд, 0 — ни одного. */
  span: number;
  trials: number;
  correct: number;
  /** Элементов на своих местах и всего показано элементов — для точности по позициям. */
  placed: number;
  shown: number;
  answerMs: number[];
};

export type MixedSummary = {
  rounds: number;
  shown: FormCounts;
  /** Показанный элемент есть в ответе с тем же значением и видом. */
  recalled: FormCounts;
  /** Показанный элемент стоит в ответе на своём месте. */
  placed: FormCounts;
  /** Значение вспомнили, но вид поменяли (цифра ↔ пиктограмма). */
  swapped: FormCounts;
  /** Сколько элементов каждого вида набрано в ответах (по нажатым клавишам). */
  inAnswer: FormCounts;
  answerMs: number[];
};

export type SessionSummary = {
  seq: { arabic: SpanSummary | null; picto: SpanSummary | null };
  mixed: MixedSummary | null;
  color: { colored: SpanSummary | null; mono: SpanSummary | null };
};

export function summarizeSpan(trials: readonly TrialRecord[]): SpanSummary | null {
  if (!trials.length) return null;
  const out: SpanSummary = {
    span: 0,
    trials: trials.length,
    correct: 0,
    placed: 0,
    shown: 0,
    answerMs: trials.map((t) => t.answerMs),
  };
  for (const t of trials) {
    if (isExact(t.shown, t.answer)) {
      out.correct++;
      out.span = Math.max(out.span, t.length);
    }
    out.placed += placedCount(t.shown, t.answer);
    out.shown += t.shown.length;
  }
  return out;
}

export function summarizeMixed(trials: readonly TrialRecord[]): MixedSummary | null {
  if (!trials.length) return null;
  const out: MixedSummary = {
    rounds: trials.length,
    shown: zero(),
    recalled: zero(),
    placed: zero(),
    swapped: zero(),
    inAnswer: zero(),
    answerMs: trials.map((t) => t.answerMs),
  };
  for (const t of trials) {
    t.shown.forEach((item, i) => {
      out.shown[item.f]++;
      if (t.answer.some((a) => sameItem(a, item))) out.recalled[item.f]++;
      else if (t.answer.some((a) => a.v === item.v)) out.swapped[item.f]++;
      if (sameItem(item, t.answer[i])) out.placed[item.f]++;
    });
    for (const a of t.answer) out.inAnswer[a.f]++;
  }
  return out;
}

export function summarizeSession(trials: readonly TrialRecord[]): SessionSummary {
  const of = (c: Condition) => trials.filter((t) => t.condition === c);
  return {
    seq: { arabic: summarizeSpan(of("arabic")), picto: summarizeSpan(of("picto")) },
    mixed: summarizeMixed(of("mixed")),
    color: { colored: summarizeSpan(of("colored")), mono: summarizeSpan(of("mono")) },
  };
}
