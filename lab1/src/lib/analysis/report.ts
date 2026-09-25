import type { Condition, StoredSession } from "@/lib/experiment/types";
import { describe, mean, pairedT, type PairedT, type Series } from "./stats";
import {
  summarizeSession,
  type FormCounts,
  type SessionSummary,
  type SpanSummary,
} from "./summary";

export type Verdict = "confirmed" | "trend" | "equal" | "opposite-trend" | "opposite" | "no-data";
/** tendency — во всех тестах среднее в пользу гипотезы, но значимо не везде. */
export type HypothesisStatus = "confirmed" | "tendency" | "partial" | "rejected" | "no-data";

export type Comparison = {
  id: "seq" | "mixed" | "color";
  title: string;
  metric: string;
  unit: string;
  /** Сторона, которая по гипотезе воспринимается лучше. */
  favored: Series;
  other: Series;
  wins: number;
  ties: number;
  losses: number;
  t: PairedT | null;
  verdict: Verdict;
};

export type ConditionStats = {
  condition: Condition;
  span: Series;
  /** Доля элементов на своих местах по всем попыткам, %. */
  accuracy: number;
  /** Среднее время ответа, с. */
  answerSec: number;
  trials: number;
};

export type MixedTotals = {
  rounds: number;
  shown: FormCounts;
  recalled: FormCounts;
  placed: FormCounts;
  swapped: FormCounts;
  inAnswer: FormCounts;
  answerSec: number;
};

export type ParticipantRow = {
  id: string;
  name: string | null;
  createdAt: string;
  spanArabic: number | null;
  spanPicto: number | null;
  mixedArabic: number | null;
  mixedPicto: number | null;
  spanColored: number | null;
  spanMono: number | null;
};

export type Tally = { shown: number; recalled: number };

export type SpanCondition = "arabic" | "picto" | "colored" | "mono";

/** Данные для диаграмм, которые нельзя восстановить из итогов по участникам. */
export type Charts = {
  /** Верно воспроизведённые ряды по длине ряда, все участники вместе. */
  lengthCurve: Record<SpanCondition, { length: number; attempts: number; correct: number }[]>;
  /** Смешанный тест: доля воспроизведённых элементов по позиции в ряду. */
  positions: { position: number; a: Tally; p: Tally }[];
  /** Доля воспроизведённых элементов по значению цифры, отдельно для цифр и пиктограмм. */
  digits: { value: number; a: Tally; p: Tally }[];
};

export type Report = {
  participants: number;
  h1: { seq: Comparison; mixed: Comparison; status: HypothesisStatus };
  h2: { color: Comparison; status: HypothesisStatus };
  conditions: ConditionStats[];
  mixed: MixedTotals | null;
  rows: ParticipantRow[];
  charts: Charts;
};

const EPS = 1e-9;
const ALPHA = 0.05;

function verdictOf(n: number, meanDiff: number, t: PairedT | null): Verdict {
  // Парному критерию нужно минимум два участника; по одному человеку выводов не делаем.
  if (n < 2) return "no-data";
  const significant = t !== null && t.p < ALPHA;
  if (meanDiff > EPS) return significant ? "confirmed" : "trend";
  if (meanDiff < -EPS) return significant ? "opposite" : "opposite-trend";
  return "equal";
}

type Pair = { favored: number; other: number };

function compare(
  meta: Pick<Comparison, "id" | "title" | "metric" | "unit">,
  labels: [string, string],
  pairs: Pair[],
): Comparison {
  const favored = pairs.map((p) => p.favored);
  const other = pairs.map((p) => p.other);
  const t = pairedT(favored, other);
  const meanDiff = mean(favored) - mean(other);
  return {
    ...meta,
    favored: describe(labels[0], favored),
    other: describe(labels[1], other),
    wins: pairs.filter((p) => p.favored - p.other > EPS).length,
    ties: pairs.filter((p) => Math.abs(p.favored - p.other) <= EPS).length,
    losses: pairs.filter((p) => p.other - p.favored > EPS).length,
    t,
    verdict: verdictOf(pairs.length, meanDiff, t),
  };
}

function statusOf(comparisons: Comparison[]): HypothesisStatus {
  const withData = comparisons.filter((c) => c.verdict !== "no-data");
  if (!withData.length) return "no-data";
  const supporting = withData.filter((c) => c.verdict === "confirmed" || c.verdict === "trend");
  if (supporting.length === withData.length) {
    return withData.every((c) => c.verdict === "confirmed") ? "confirmed" : "tendency";
  }
  return supporting.length === 0 ? "rejected" : "partial";
}

const SPAN_CONDITIONS: SpanCondition[] = ["arabic", "picto", "colored", "mono"];
const emptyTally = (): Tally => ({ shown: 0, recalled: 0 });

function buildCharts(sessions: readonly StoredSession[]): Charts {
  const lengths = new Map<string, { attempts: number; correct: number }>();
  const positions = new Map<number, { a: Tally; p: Tally }>();
  const digits = new Map<number, { a: Tally; p: Tally }>();

  for (const session of sessions) {
    for (const t of session.trials) {
      if (t.condition !== "mixed") {
        const key = `${t.condition}:${t.length}`;
        const cell = lengths.get(key) ?? { attempts: 0, correct: 0 };
        cell.attempts++;
        if (t.correct) cell.correct++;
        lengths.set(key, cell);
      }
      t.shown.forEach((item, i) => {
        const recalled = t.answer.some((a) => a.v === item.v && a.f === item.f);
        const digit = digits.get(item.v) ?? { a: emptyTally(), p: emptyTally() };
        digit[item.f].shown++;
        if (recalled) digit[item.f].recalled++;
        digits.set(item.v, digit);
        if (t.condition === "mixed") {
          const pos = positions.get(i + 1) ?? { a: emptyTally(), p: emptyTally() };
          pos[item.f].shown++;
          if (recalled) pos[item.f].recalled++;
          positions.set(i + 1, pos);
        }
      });
    }
  }

  const lengthCurve = Object.fromEntries(
    SPAN_CONDITIONS.map((c) => [
      c,
      [...lengths]
        .filter(([key]) => key.startsWith(`${c}:`))
        .map(([key, v]) => ({ length: Number(key.split(":")[1]), ...v }))
        .sort((x, y) => x.length - y.length),
    ]),
  ) as Charts["lengthCurve"];

  return {
    lengthCurve,
    positions: [...positions].map(([position, v]) => ({ position, ...v })).sort((x, y) => x.position - y.position),
    digits: [...digits].map(([value, v]) => ({ value, ...v })).sort((x, y) => x.value - y.value),
  };
}

const rate = (hit: number, total: number) => (total ? (hit / total) * 100 : 0);

function conditionStats(
  condition: Condition,
  summaries: SessionSummary[],
  pick: (s: SessionSummary) => SpanSummary | null,
): ConditionStats {
  const all = summaries.map(pick).filter((s): s is SpanSummary => s !== null);
  const placed = all.reduce((n, s) => n + s.placed, 0);
  const shown = all.reduce((n, s) => n + s.shown, 0);
  const times = all.flatMap((s) => s.answerMs);
  return {
    condition,
    span: describe(condition, all.map((s) => s.span)),
    accuracy: rate(placed, shown),
    answerSec: mean(times) / 1000,
    trials: all.reduce((n, s) => n + s.trials, 0),
  };
}

function mixedTotals(summaries: SessionSummary[]): MixedTotals | null {
  const all = summaries.map((s) => s.mixed).filter((m) => m !== null);
  if (!all.length) return null;
  const sum = (pick: (m: (typeof all)[number]) => FormCounts): FormCounts => ({
    a: all.reduce((n, m) => n + pick(m).a, 0),
    p: all.reduce((n, m) => n + pick(m).p, 0),
  });
  return {
    rounds: all.reduce((n, m) => n + m.rounds, 0),
    shown: sum((m) => m.shown),
    recalled: sum((m) => m.recalled),
    placed: sum((m) => m.placed),
    swapped: sum((m) => m.swapped),
    inAnswer: sum((m) => m.inAnswer),
    answerSec: mean(all.flatMap((m) => m.answerMs)) / 1000,
  };
}

export function buildReport(sessions: readonly StoredSession[]): Report {
  const summaries = sessions.map((s) => summarizeSession(s.trials));

  const spanPairs = (
    pick: (s: SessionSummary) => [SpanSummary | null, SpanSummary | null],
  ): Pair[] =>
    summaries.flatMap((s) => {
      const [favored, other] = pick(s);
      return favored && other ? [{ favored: favored.span, other: other.span }] : [];
    });

  const mixedPairs = summaries.flatMap((s) => {
    const m = s.mixed;
    return m && m.shown.a && m.shown.p
      ? [{ favored: rate(m.recalled.a, m.shown.a), other: rate(m.recalled.p, m.shown.p) }]
      : [];
  });

  const seq = compare(
    {
      id: "seq",
      title: "Тест 1 · Длина воспроизведённого ряда",
      metric: "Самый длинный верно воспроизведённый ряд",
      unit: "элементов",
    },
    ["Арабские цифры", "Пиктограммы"],
    spanPairs((s) => [s.seq.arabic, s.seq.picto]),
  );
  const mixed = compare(
    {
      id: "mixed",
      title: "Тест 2 · Смешанные ряды",
      metric: "Доля верно воспроизведённых элементов",
      unit: "%",
    },
    ["Арабские цифры", "Пиктограммы"],
    mixedPairs,
  );
  const color = compare(
    {
      id: "color",
      title: "Тест 3 · Яркие и монохромные цифры",
      metric: "Самый длинный верно воспроизведённый ряд",
      unit: "элементов",
    },
    ["Яркие цифры", "Монохромные цифры"],
    spanPairs((s) => [s.color.colored, s.color.mono]),
  );

  return {
    participants: sessions.length,
    h1: { seq, mixed, status: statusOf([seq, mixed]) },
    h2: { color, status: statusOf([color]) },
    conditions: [
      conditionStats("arabic", summaries, (s) => s.seq.arabic),
      conditionStats("picto", summaries, (s) => s.seq.picto),
      conditionStats("colored", summaries, (s) => s.color.colored),
      conditionStats("mono", summaries, (s) => s.color.mono),
    ],
    mixed: mixedTotals(summaries),
    rows: sessions.map((session, i) => participantRow(session, summaries[i])),
    charts: buildCharts(sessions),
  };
}

export function participantRow(session: StoredSession, s: SessionSummary): ParticipantRow {
  const m = s.mixed;
  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    spanArabic: s.seq.arabic?.span ?? null,
    spanPicto: s.seq.picto?.span ?? null,
    mixedArabic: m && m.shown.a ? rate(m.recalled.a, m.shown.a) : null,
    mixedPicto: m && m.shown.p ? rate(m.recalled.p, m.shown.p) : null,
    spanColored: s.color.colored?.span ?? null,
    spanMono: s.color.mono?.span ?? null,
  };
}
