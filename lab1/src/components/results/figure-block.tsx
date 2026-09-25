import type { Figure } from "@/lib/analysis/figures";

/** Диаграмма с подписью «Рисунок N — …». SVG собран из наших чисел и подписей, разметка экранирована в генераторе. */
export function FigureBlock({ figure }: { figure: Figure }) {
  return (
    <figure className="space-y-3">
      <div
        className="mx-auto w-full max-w-[600px] rounded-2xl border border-line bg-surface p-3 sm:p-4 [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: figure.svg }}
      />
      <figcaption className="mx-auto max-w-[600px] text-center text-sm text-muted">
        Рисунок {figure.number} — {figure.caption}
      </figcaption>
    </figure>
  );
}
