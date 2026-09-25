import Link from "next/link";
import type { ParticipantRow } from "@/lib/analysis/report";
import { GROUP_SHORT } from "@/lib/experiment/labels";
import { num } from "@/lib/format";
import { LocalTime } from "./local-time";

const dash = "—";
const span = (v: number | null) => (v === null ? dash : String(v));
const pct = (v: number | null) => (v === null ? dash : `${num(v, 0)}%`);

export function ParticipantsTable({
  rows,
  caption,
  showGroup = false,
}: {
  rows: ParticipantRow[];
  caption: string;
  /** Столбец «Группа» имеет смысл только в сводном (нефильтрованном) виде. */
  showGroup?: boolean;
}) {
  const head = [
    "№",
    "Участник",
    ...(showGroup ? ["Группа"] : []),
    "Дата",
    "Цифры",
    "Пикт.",
    "Цифры, %",
    "Пикт., %",
    "Яркие",
    "Монохр.",
  ];
  const leadCols = showGroup ? 4 : 3;
  return (
    <figure className="space-y-3">
      <figcaption className="text-sm font-medium">{caption}</figcaption>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="tabular w-full min-w-max border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-4 pt-3 font-medium" colSpan={leadCols} />
              <th className="px-4 pt-3 text-center font-medium" colSpan={2}>
                Тест 1 · длина ряда
              </th>
              <th className="px-4 pt-3 text-center font-medium" colSpan={2}>
                Тест 2 · смешанные
              </th>
              <th className="px-4 pt-3 text-center font-medium" colSpan={2}>
                Тест 3 · длина ряда
              </th>
            </tr>
            <tr className="border-b border-line text-xs text-muted">
              {head.map((h, i) => (
                <th key={h} className={`px-4 pb-3 pt-1 font-medium ${i >= leadCols ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-soft">
                <td className="px-4 py-3 text-muted">{i + 1}</td>
                <td className="px-4 py-3 font-medium">
                  <Link href={`/results/${r.id}`} className="underline-offset-4 hover:underline">
                    {r.name ?? "Без имени"}
                  </Link>
                </td>
                {showGroup && <td className="px-4 py-3 text-muted">{GROUP_SHORT[r.group]}</td>}
                <td className="px-4 py-3 text-muted">
                  <LocalTime iso={r.createdAt} />
                </td>
                <td className="px-4 py-3 text-right">{span(r.spanArabic)}</td>
                <td className="px-4 py-3 text-right">{span(r.spanPicto)}</td>
                <td className="px-4 py-3 text-right">{pct(r.mixedArabic)}</td>
                <td className="px-4 py-3 text-right">{pct(r.mixedPicto)}</td>
                <td className="px-4 py-3 text-right">{span(r.spanColored)}</td>
                <td className="px-4 py-3 text-right">{span(r.spanMono)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
