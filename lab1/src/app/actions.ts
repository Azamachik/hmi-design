"use server";

import { isDbConfigured } from "@/lib/db/client";
import { insertSession } from "@/lib/db/sessions";
import { sessionSchema } from "@/lib/experiment/schema";
import { isExact } from "@/lib/experiment/scoring";
import type { SessionPayload } from "@/lib/experiment/types";

/** retryable — имеет смысл повторить (сбой связи с базой); ошибка данных или настроек от повтора не пройдёт. */
export type SaveResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean };

const DB_ATTEMPTS = 3;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Причина сбоя одной строкой, чтобы её было видно на экране участника и в логах. */
function reasonOf(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error ? `${String(error.code)}: ` : "";
  const message = error instanceof Error ? error.message : String(error);
  return `${code}${message}`.replace(/\s+/g, " ").slice(0, 140);
}

/**
 * Бесплатный Neon засыпает после простоя, и первое обращение к нему иногда срывается.
 * Запись идемпотентна (повторная отправка того же результата дублей не создаёт), поэтому повтор безопасен.
 */
async function insertWithRetry(session: SessionPayload) {
  for (let attempt = 1; ; attempt++) {
    try {
      await insertSession(session);
      return;
    } catch (error) {
      console.error(`saveSession: попытка ${attempt} из ${DB_ATTEMPTS} не удалась`, error);
      if (attempt >= DB_ATTEMPTS) throw error;
      await pause(700 * attempt);
    }
  }
}

export async function saveSession(input: unknown): Promise<SaveResult> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    console.error("saveSession: данные не прошли проверку", parsed.error.issues.slice(0, 5));
    return {
      ok: false,
      error: `Результат содержит некорректные данные (${issue.path.join(".") || "формат"}).`,
      retryable: false,
    };
  }
  if (!isDbConfigured()) {
    return {
      ok: false,
      error: "База данных не подключена: не задана переменная DATABASE_URL.",
      retryable: false,
    };
  }

  const session = parsed.data;
  try {
    await insertWithRetry({
      ...session,
      // Верность ответа считаем на сервере, а не берём от клиента.
      trials: session.trials.map((t) => ({ ...t, correct: isExact(t.shown, t.answer) })),
    });
    return { ok: true, id: session.id };
  } catch (error) {
    console.error("saveSession failed", error);
    return {
      ok: false,
      error: `Не удалось сохранить результат в базе данных (${reasonOf(error)}).`,
      retryable: true,
    };
  }
}
