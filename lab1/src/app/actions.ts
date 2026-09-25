"use server";

import { isDbConfigured } from "@/lib/db/client";
import { insertSession } from "@/lib/db/sessions";
import { sessionSchema } from "@/lib/experiment/schema";
import { isExact } from "@/lib/experiment/scoring";

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveSession(input: unknown): Promise<SaveResult> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Результат содержит некорректные данные." };
  if (!isDbConfigured()) {
    return { ok: false, error: "База данных не подключена: не задана переменная DATABASE_URL." };
  }

  const session = parsed.data;
  try {
    await insertSession({
      ...session,
      // Верность ответа считаем на сервере, а не берём от клиента.
      trials: session.trials.map((t) => ({ ...t, correct: isExact(t.shown, t.answer) })),
    });
    return { ok: true, id: session.id };
  } catch (error) {
    console.error("saveSession failed", error);
    return { ok: false, error: "Не удалось сохранить результат в базе данных." };
  }
}
