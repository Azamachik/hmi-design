import { Experiment } from "@/components/experiment/experiment";
import { DEFAULT_ANSWER_MS, DEFAULT_EXPOSURE_MS } from "@/lib/experiment/config";
import type { Group } from "@/lib/experiment/types";

function numberParam(
  value: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/**
 * ?t=4000 — фиксированное время показа ряда, мс (одинаково для любой длины);
 * ?a=30000 — лимит на ответ, мс; ?g=control — открыть с отмеченной контрольной группой
 * (авторы программы; переключатель на экране всё равно можно поменять).
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const g = Array.isArray(params.g) ? params.g[0] : params.g;
  const initialGroup: Group = g === "control" ? "control" : "test";
  return (
    <Experiment
      exposureMs={numberParam(params.t, DEFAULT_EXPOSURE_MS, 500, 15_000)}
      answerMs={numberParam(params.a, DEFAULT_ANSWER_MS, 3000, 120_000)}
      initialGroup={initialGroup}
    />
  );
}
