import { itemsToText } from "@/lib/format";
import type { StoredSession } from "@/lib/experiment/types";
import { participantRow } from "./report";
import { summarizeSession } from "./summary";

type Cell = string | number | null;

// Русский Excel ждёт «;» между колонками и запятую в дробях.
function cell(value: Cell) {
  if (value === null) return "";
  const text = typeof value === "number" && !Number.isInteger(value)
    ? value.toFixed(1).replace(".", ",")
    : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: Cell[][]) {
  // BOM, чтобы Excel сам определил UTF-8.
  return `﻿${rows.map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`;
}

export function participantsCsv(sessions: readonly StoredSession[]) {
  return toCsv([
    [
      "id",
      "name",
      "group",
      "created_at",
      "order_seq",
      "order_color",
      "span_arabic",
      "span_picto",
      "mixed_arabic_pct",
      "mixed_picto_pct",
      "span_colored",
      "span_mono",
      "touch",
    ],
    ...sessions.map((s) => {
      const r = participantRow(s, summarizeSession(s.trials));
      return [
        s.id,
        s.name,
        s.group,
        s.createdAt,
        s.blockOrder.seq.join(">"),
        s.blockOrder.color.join(">"),
        r.spanArabic,
        r.spanPicto,
        r.mixedArabic,
        r.mixedPicto,
        r.spanColored,
        r.spanMono,
        s.device ? (s.device.touch ? 1 : 0) : null,
      ];
    }),
  ]);
}

export function trialsCsv(sessions: readonly StoredSession[]) {
  return toCsv([
    [
      "session_id",
      "name",
      "group",
      "seq",
      "test",
      "condition",
      "idx",
      "length",
      "shown",
      "answer",
      "correct",
      "answer_ms",
      "timed_out",
    ],
    ...sessions.flatMap((s) =>
      s.trials.map((t) => [
        s.id,
        s.name,
        s.group,
        t.seq,
        t.test,
        t.condition,
        t.idx,
        t.length,
        itemsToText(t.shown),
        itemsToText(t.answer),
        t.correct ? 1 : 0,
        t.answerMs,
        t.timedOut ? 1 : 0,
      ]),
    ),
  ]);
}
