import type { Item } from "./types";

export function sameItem(a: Item | undefined, b: Item | undefined) {
  return !!a && !!b && a.v === b.v && a.f === b.f;
}

/** Ряд воспроизведён целиком и по порядку. */
export function isExact(shown: readonly Item[], answer: readonly Item[]) {
  return shown.length === answer.length && shown.every((s, i) => sameItem(s, answer[i]));
}

/** Сколько элементов ответа стоят на своих местах. */
export function placedCount(shown: readonly Item[], answer: readonly Item[]) {
  return shown.reduce((n, s, i) => n + (sameItem(s, answer[i]) ? 1 : 0), 0);
}
