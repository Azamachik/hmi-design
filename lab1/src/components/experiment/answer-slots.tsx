import { Glyph } from "@/components/glyph";
import { glyphColor } from "@/lib/experiment/palette";
import type { Condition, Item } from "@/lib/experiment/types";
import { SequenceGrid } from "./sequence-grid";

type Props = {
  length: number;
  answer: readonly Item[];
  condition: Condition;
};

export function AnswerSlots({ length, answer, condition }: Props) {
  return (
    <SequenceGrid count={length} size={72} gap={10}>
      {Array.from({ length }, (_, i) => {
        const item = answer[i];
        const tone = item
          ? "border-line bg-surface"
          : i === answer.length
            ? "border-dashed border-ink/50"
            : "border-dashed border-line";
        return (
          <div key={i} className={`aspect-square rounded-2xl border p-2 ${tone}`}>
            {item && <Glyph item={item} color={glyphColor(item, condition)} className="size-full" />}
          </div>
        );
      })}
    </SequenceGrid>
  );
}
