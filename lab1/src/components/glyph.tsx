import type { Item } from "@/lib/experiment/types";

// Точки пиктограммы по сетке 3×3 (индексы слева направо, сверху вниз). Пустой квадрат — 0.
const PIPS: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
  7: [0, 2, 3, 4, 5, 6, 8],
  8: [0, 1, 2, 3, 5, 6, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

const GRID = [32, 50, 68];

type Props = {
  item: Item;
  /** Цвет заливки; по умолчанию наследуется от текста. */
  color?: string;
  className?: string;
};

/** Один элемент ряда: арабская цифра или пиктограмма. Рисуется на квадрате 100×100. */
export function Glyph({ item, color, className }: Props) {
  const label = `${item.f === "a" ? "Цифра" : "Пиктограмма"} ${item.v}`;
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={label}
      data-form={item.f}
      data-value={item.v}
      className={className}
      style={color ? { color } : undefined}
    >
      {item.f === "a" ? (
        <text
          x="50"
          y="50"
          dy=".364em"
          textAnchor="middle"
          fontSize="88"
          fontWeight="600"
          fill="currentColor"
        >
          {item.v}
        </text>
      ) : (
        <>
          <rect
            x="14"
            y="14"
            width="72"
            height="72"
            rx="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
          />
          {PIPS[item.v].map((cell) => (
            <circle
              key={cell}
              cx={GRID[cell % 3]}
              cy={GRID[Math.floor(cell / 3)]}
              r="6.5"
              fill="currentColor"
            />
          ))}
        </>
      )}
    </svg>
  );
}
