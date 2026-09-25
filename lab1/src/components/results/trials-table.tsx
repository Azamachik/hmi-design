import { Glyph } from "@/components/glyph";
import { CONDITION_LABEL } from "@/lib/experiment/labels";
import { glyphColor } from "@/lib/experiment/palette";
import { sameItem } from "@/lib/experiment/scoring";
import type { Condition, Item, TrialRecord } from "@/lib/experiment/types";
import { num } from "@/lib/format";

function Row({
  items,
  condition,
  reference,
}: {
  items: readonly Item[];
  condition: Condition;
  /** Если задан, элементы подсвечиваются верно/неверно относительно этого ряда. */
  reference?: readonly Item[];
}) {
  return (
    <div className="flex gap-0.5">
      {items.length === 0 && <span className="text-muted">—</span>}
      {items.map((item, i) => {
        const tone = !reference
          ? "bg-soft"
          : sameItem(item, reference[i])
            ? "bg-ok-soft"
            : "bg-bad-soft";
        return (
          <span key={i} className={`size-7 shrink-0 rounded-md p-0.5 ${tone}`}>
            <Glyph item={item} color={glyphColor(item, condition)} className="size-full" />
          </span>
        );
      })}
    </div>
  );
}

export function TrialsTable({ trials, caption }: { trials: readonly TrialRecord[]; caption: string }) {
  return (
    <figure className="space-y-3">
      <figcaption className="text-sm font-medium">{caption}</figcaption>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="tabular w-full min-w-max border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              {["№", "Условие", "Показано", "Ответ", "Верно", "Время, с"].map((h) => (
                <th key={h} className="px-3 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trials.map((t) => (
              <tr key={t.seq} className="border-b border-line align-middle last:border-0">
                <td className="px-3 py-2.5 text-muted">{t.seq + 1}</td>
                <td className="max-w-36 px-3 py-2.5">{CONDITION_LABEL[t.condition]}</td>
                <td className="px-3 py-2.5">
                  <Row items={t.shown} condition={t.condition} />
                </td>
                <td className="px-3 py-2.5">
                  <Row items={t.answer} condition={t.condition} reference={t.shown} />
                </td>
                <td className={`px-3 py-2.5 font-medium ${t.correct ? "text-ok" : "text-bad"}`}>
                  {t.correct ? "да" : t.timedOut ? "время" : "нет"}
                </td>
                <td className="px-3 py-2.5 text-muted">{num(t.answerMs / 1000)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
