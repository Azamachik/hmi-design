import { isDbConfigured } from "./client";

export type Loaded<T> = { state: "ok"; data: T } | { state: "no-db" } | { state: "error" };

/** Страницам результатов нужно отличать «база не подключена» от «база не отвечает». */
export async function load<T>(query: () => Promise<T>): Promise<Loaded<T>> {
  if (!isDbConfigured()) return { state: "no-db" };
  try {
    return { state: "ok", data: await query() };
  } catch (error) {
    console.error("db load failed", error);
    return { state: "error" };
  }
}
