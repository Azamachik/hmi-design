import { Glyph } from "@/components/glyph";
import { glyphColor } from "@/lib/experiment/palette";
import { DIGITS, type Condition, type Form, type Item } from "@/lib/experiment/types";

type Group = { form: Form; label?: string };

function groupsFor(condition: Condition): Group[] {
  if (condition === "mixed") {
    return [
      { form: "a", label: "Цифры" },
      { form: "p", label: "Пиктограммы" },
    ];
  }
  return [{ form: condition === "picto" ? "p" : "a" }];
}

type Props = {
  condition: Condition;
  onPick: (item: Item) => void;
};

/**
 * Ответ вводится только экранными клавишами того же вида, что и стимул:
 * так цена ответа не зависит от условия, а пиктограммы не приходится переводить в цифры.
 */
export function Keypad({ condition, onPick }: Props) {
  return (
    // В смешанном блоке на широком экране две клавиатуры стоят рядом, чтобы ответ помещался без прокрутки.
    <div className="space-y-4 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:space-y-0">
      {groupsFor(condition).map(({ form, label }) => (
        <div key={form}>
          {label && <p className="mb-2 text-xs font-medium text-muted">{label}</p>}
          <div className="grid grid-cols-5 gap-2">
            {DIGITS.map((v) => {
              const item: Item = { v, f: form };
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onPick(item)}
                  className="aspect-square rounded-2xl border border-line bg-surface p-2.5 transition hover:border-line-strong active:scale-95 active:bg-soft"
                >
                  <Glyph item={item} color={glyphColor(item, condition)} className="size-full" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
