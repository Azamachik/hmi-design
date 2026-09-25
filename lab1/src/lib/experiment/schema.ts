import { z } from "zod";
import { CONDITIONS, FORMS, GROUPS, TESTS } from "./types";

const item = z.object({
  v: z.number().int().min(0).max(9),
  f: z.enum(FORMS),
});

const trial = z
  .object({
    seq: z.number().int().min(0).max(999),
    test: z.enum(TESTS),
    condition: z.enum(CONDITIONS),
    idx: z.number().int().min(0).max(99),
    length: z.number().int().min(1).max(10),
    shown: z.array(item).min(1).max(10),
    answer: z.array(item).max(10),
    correct: z.boolean(),
    answerMs: z.number().int().min(0).max(600_000),
    timedOut: z.boolean(),
  })
  .refine((t) => t.shown.length === t.length && t.answer.length <= t.length, {
    message: "Длина ряда не совпадает с показанным и введённым",
  });

/** Проверка того, что приходит с клиента: страница открыта всем, доверять входу нельзя. */
export const sessionSchema = z.object({
  id: z.uuid(),
  name: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .transform((s) => s || null),
  group: z.enum(GROUPS),
  blockOrder: z.object({
    seq: z.array(z.enum(CONDITIONS)).max(2),
    color: z.array(z.enum(CONDITIONS)).max(2),
  }),
  settings: z.object({
    exposureMs: z.number().int().min(200).max(30_000),
    answerMs: z.number().int().min(1000).max(600_000),
  }),
  device: z
    .object({
      touch: z.boolean(),
      w: z.number().int().min(0).max(50_000),
      h: z.number().int().min(0).max(50_000),
    })
    .nullable(),
  trials: z.array(trial).min(1).max(200),
});
