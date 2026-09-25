import type { Comparison } from "@/lib/analysis/report";
import type { Series } from "@/lib/analysis/stats";
import { verdictNote, VERDICT_TEXT } from "@/lib/analysis/text";
import { MAX_LENGTH } from "@/lib/experiment/config";
import { DIGIT_COLORS } from "@/lib/experiment/palette";
import { num, pValue } from "@/lib/format";
import { Badge, Card, Stat } from "./primitives";

const RAINBOW = `linear-gradient(90deg, ${DIGIT_COLORS.join(", ")})`;

type BarProps = { series: Series; max: number; unit: string; fill: string };

function Bar({ series, max, unit, fill }: BarProps) {
  const width = series.n ? Math.min(100, (series.mean / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[6.5rem_1fr_6rem] items-center gap-3 sm:grid-cols-[11rem_1fr_7rem]">
      <span className="text-sm">{series.label}</span>
      <div className="h-3 overflow-hidden rounded-full bg-soft">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: fill }} />
      </div>
      <span className="tabular text-right text-sm font-medium">
        {series.n ? `${num(series.mean)}${unit}` : "—"}
        {series.n > 1 && <span className="font-normal text-muted"> ± {num(series.sd)}</span>}
      </span>
    </div>
  );
}

export function ComparisonCard({ comparison: c }: { comparison: Comparison }) {
  const verdict = VERDICT_TEXT[c.verdict];
  const isPercent = c.unit === "%";
  const max = isPercent ? 100 : MAX_LENGTH;
  const unit = isPercent ? "%" : "";
  const favoredFill = c.id === "color" ? RAINBOW : "var(--ink)";
  const diff = c.t?.meanDiff ?? c.favored.mean - c.other.mean;

  return (
    <Card className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight">{c.title}</h3>
          <p className="text-sm text-muted">
            {c.metric}
            {isPercent ? ", %" : `, ${c.unit}`}
          </p>
        </div>
        <Badge tone={verdict.tone}>{verdict.label}</Badge>
      </div>

      <div className="space-y-3">
        <Bar series={c.favored} max={max} unit={unit} fill={favoredFill} />
        <Bar series={c.other} max={max} unit={unit} fill="var(--faint)" />
      </div>

      <dl className="grid grid-cols-2 gap-6 border-t border-line pt-5 sm:grid-cols-4">
        <Stat label="Участников" value={c.favored.n} />
        <Stat label="Разность средних" value={c.favored.n ? `${diff > 0 ? "+" : ""}${num(diff)}` : "—"} />
        <Stat
          label="Парный t-критерий"
          value={c.t && Number.isFinite(c.t.t) ? num(c.t.t, 2) : "—"}
          hint={c.t ? `df = ${c.t.df}` : undefined}
        />
        <Stat label="Значимость" value={c.t ? pValue(c.t.p) : "—"} hint="p, двусторонняя" />
      </dl>

      <div className="space-y-1 text-sm text-muted">
        <p>
          {c.favored.label} лучше у {c.wins}, {c.other.label.toLowerCase()} лучше у {c.losses}, поровну
          у {c.ties}.
        </p>
        <p>{verdictNote(c)}</p>
      </div>
    </Card>
  );
}
