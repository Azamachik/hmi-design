export const START_LENGTH = 3;
export const MAX_LENGTH = 9;
/** Столько ошибок подряд завершают блок с растущей длиной ряда. */
export const MAX_FAILS = 2;

export const MIXED_LENGTH = 8;
export const MIXED_ROUNDS = 6;

export const PRACTICE_LENGTH = 3;

export const DEFAULT_ITEM_MS = 500;
export const MIN_EXPOSURE_MS = 1500;
export const DEFAULT_ANSWER_MS = 20_000;
export const READY_MS = 900;

/** Ряд показывается целиком; время экспозиции растёт с его длиной. */
export function exposureMs(length: number, itemMs: number) {
  return Math.max(MIN_EXPOSURE_MS, length * itemMs);
}
