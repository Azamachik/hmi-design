import type { CSSProperties, ReactNode } from "react";

/** До пяти элементов — в одну строку, дальше — в две, чтобы влезало на телефоне. */
export function gridColumns(count: number) {
  return count <= 5 ? count : Math.ceil(count / 2);
}

type Props = {
  count: number;
  /** Максимальная сторона ячейки, px. */
  size?: number;
  gap?: number;
  align?: "center" | "start";
  children: ReactNode;
};

/** Ряд элементов; порядок чтения — слева направо, сверху вниз. */
export function SequenceGrid({ count, size = 88, gap = 12, align = "center", children }: Props) {
  const cols = gridColumns(count);
  const style: CSSProperties = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gap,
    maxWidth: cols * size + (cols - 1) * gap,
  };
  return (
    <div className={`grid w-full ${align === "center" ? "mx-auto" : ""}`} style={style}>
      {children}
    </div>
  );
}
