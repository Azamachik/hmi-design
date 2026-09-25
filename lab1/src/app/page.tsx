import { Experiment } from "@/components/experiment/experiment";
import { DEFAULT_ANSWER_MS, DEFAULT_ITEM_MS } from "@/lib/experiment/config";

function numberParam(
  value: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/** ?t=700 — мс показа на один элемент, ?a=30000 — лимит на ответ, мс. */
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  return (
    <Experiment
      itemMs={numberParam(params.t, DEFAULT_ITEM_MS, 100, 3000)}
      answerMs={numberParam(params.a, DEFAULT_ANSWER_MS, 3000, 120_000)}
    />
  );
}
