export const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Вид элемента: арабская цифра или пиктограмма (кость с точками). */
export const FORMS = ["a", "p"] as const;
export type Form = (typeof FORMS)[number];

export type Item = { v: number; f: Form };

export const TESTS = ["seq", "mixed", "color"] as const;
export type TestId = (typeof TESTS)[number];

export const CONDITIONS = ["picto", "arabic", "mixed", "colored", "mono"] as const;
export type Condition = (typeof CONDITIONS)[number];

/** control — авторы программы (контрольная группа по методичке), test — остальные участники. */
export const GROUPS = ["test", "control"] as const;
export type Group = (typeof GROUPS)[number];

export type TrialRecord = {
  /** Сквозной номер попытки в сессии, с нуля. */
  seq: number;
  test: TestId;
  condition: Condition;
  /** Номер попытки внутри блока, с нуля. */
  idx: number;
  length: number;
  shown: Item[];
  answer: Item[];
  /** Ряд воспроизведён целиком и в правильном порядке. */
  correct: boolean;
  answerMs: number;
  timedOut: boolean;
};

export type BlockOrder = {
  seq: Condition[];
  color: Condition[];
};

export type Settings = {
  /** Время показа ряда, мс — одинаково для любой его длины. */
  exposureMs: number;
  /** Лимит времени на ответ, мс. */
  answerMs: number;
};

export type Device = { touch: boolean; w: number; h: number };

export type SessionPayload = {
  id: string;
  name: string | null;
  group: Group;
  blockOrder: BlockOrder;
  settings: Settings;
  device: Device | null;
  trials: TrialRecord[];
};

/** Сессия, прочитанная из базы. */
export type StoredSession = SessionPayload & { createdAt: string };
