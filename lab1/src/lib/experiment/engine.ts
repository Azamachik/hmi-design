import {
  MAX_FAILS,
  MAX_LENGTH,
  MIXED_LENGTH,
  MIXED_ROUNDS,
  PRACTICE_LENGTH,
  START_LENGTH,
} from "./config";
import type { BlockOrder, Condition, TestId } from "./types";

/**
 * practice — пробный ряд, в результаты не идёт;
 * span — длина ряда растёт после верного ответа;
 * fixed — несколько рядов одной длины.
 */
export type BlockKind = "practice" | "span" | "fixed";

export type BlockDef = { kind: BlockKind; test: TestId; condition: Condition };

export type BlockState = {
  /** Сколько попыток в блоке уже сделано. */
  trial: number;
  /** Длина ряда для следующей попытки. */
  length: number;
  /** Ошибок подряд. */
  fails: number;
  /** Самая длинная верно воспроизведённая длина. */
  span: number;
};

export function buildPlan(order: BlockOrder): BlockDef[] {
  const span = (test: TestId, condition: Condition): BlockDef => ({ kind: "span", test, condition });
  return [
    { kind: "practice", test: "seq", condition: "arabic" },
    ...order.seq.map((c) => span("seq", c)),
    { kind: "fixed", test: "mixed", condition: "mixed" },
    ...order.color.map((c) => span("color", c)),
  ];
}

export function initialBlockState(def: BlockDef): BlockState {
  const length =
    def.kind === "fixed" ? MIXED_LENGTH : def.kind === "practice" ? PRACTICE_LENGTH : START_LENGTH;
  return { trial: 0, length, fails: 0, span: 0 };
}

export function advance(
  def: BlockDef,
  state: BlockState,
  correct: boolean,
): { state: BlockState; done: boolean } {
  const trial = state.trial + 1;

  if (def.kind === "practice") return { state: { ...state, trial }, done: true };
  if (def.kind === "fixed") return { state: { ...state, trial }, done: trial >= MIXED_ROUNDS };

  if (correct) {
    return {
      state: { trial, length: state.length + 1, fails: 0, span: Math.max(state.span, state.length) },
      done: state.length >= MAX_LENGTH,
    };
  }
  const fails = state.fails + 1;
  return { state: { ...state, trial, fails }, done: fails >= MAX_FAILS };
}
