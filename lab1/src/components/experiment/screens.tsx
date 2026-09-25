"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Glyph } from "@/components/glyph";
import { Button, buttonStyles } from "@/components/ui/button";
import { MAX_FAILS, MIXED_LENGTH, MIXED_ROUNDS, PRACTICE_LENGTH } from "@/lib/experiment/config";
import type { BlockKind } from "@/lib/experiment/engine";
import { glyphColor } from "@/lib/experiment/palette";
import { sameItem } from "@/lib/experiment/scoring";
import type { Condition, Group, Item } from "@/lib/experiment/types";
import { SequenceGrid } from "./sequence-grid";

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium text-muted">{children}</p>;
}

const item = (v: number, f: Item["f"]): Item => ({ v, f });

type IntroProps = {
  initialGroup: Group;
  onStart: (name: string, group: Group) => void;
};

export function IntroScreen({ initialGroup, onStart }: IntroProps) {
  const [name, setName] = useState("");
  const [isControl, setIsControl] = useState(initialGroup === "control");

  return (
    <form
      className="space-y-10 pt-8 sm:pt-14"
      onSubmit={(e) => {
        e.preventDefault();
        onStart(name.trim(), isControl ? "control" : "test");
      }}
    >
      <div className="space-y-4">
        <Eyebrow>Проектирование ЧМИ · Лабораторная работа 1</Eyebrow>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Запомни ряд</h1>
        <p className="max-w-prose text-lg leading-relaxed text-muted">
          Вам покажут короткие ряды из цифр и пиктограмм. Запомните ряд и воспроизведите его по
          порядку.
        </p>
      </div>

      <ol className="space-y-3 text-[15px] leading-relaxed">
        {[
          "Ряд появится на несколько секунд и исчезнет.",
          "Нажимайте элементы в том порядке, в каком они шли: слева направо, сверху вниз.",
          "После верного ответа ряд становится длиннее.",
        ].map((text, i) => (
          <li key={text} className="flex gap-4">
            <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-medium text-muted">
              {i + 1}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-6 rounded-3xl border border-line bg-surface p-5">
        <div className="flex shrink-0 gap-3">
          <Glyph item={item(1, "a")} className="size-14 text-ink" />
          <Glyph item={item(1, "p")} className="size-14 text-ink" />
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Цифра 1 и пиктограмма 1. Число точек в квадрате равно цифре, пустой квадрат — ноль.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Как вас записать?
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          autoComplete="off"
          placeholder="Имя или код, необязательно"
          className="h-12 w-full rounded-2xl border border-line-strong bg-surface px-4 text-base outline-none placeholder:text-faint focus:border-ink"
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
        <input
          type="checkbox"
          checked={isControl}
          onChange={(e) => setIsControl(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-ink"
        />
        <span>
          Я — автор программы (контрольная группа). Отметьте, если вы разрабатывали этот тест, а не
          проходите его как участник.
        </span>
      </label>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="h-12 px-8 text-base">
            Начать
          </Button>
          <Link href="/results" className={buttonStyles("ghost", "h-12")}>
            Результаты
          </Link>
        </div>
        <p className="text-sm text-muted">
          Пробный ряд и пять блоков, около десяти минут. Лучше пройти без отвлечений.
        </p>
      </div>
    </form>
  );
}

const BLOCK_TEXT: Record<Condition, { title: string; lead: string; sample: Item[] }> = {
  arabic: {
    title: "Арабские цифры",
    lead: "Ряд из обычных цифр. Отвечайте такими же цифрами.",
    sample: [item(3, "a"), item(8, "a"), item(1, "a")],
  },
  picto: {
    title: "Пиктограммы",
    lead: "Ряд из пиктограмм: число точек в квадрате — это цифра. Отвечайте такими же пиктограммами.",
    sample: [item(3, "p"), item(8, "p"), item(1, "p")],
  },
  mixed: {
    title: "Цифры и пиктограммы вперемешку",
    lead: "В каждом ряду есть и цифры, и пиктограммы. Воспроизводите ряд так, как он был показан: цифру — цифрой, пиктограмму — пиктограммой.",
    sample: [item(3, "a"), item(8, "p"), item(1, "a"), item(5, "p")],
  },
  colored: {
    title: "Яркие цифры",
    lead: "Ряд из цифр, окрашенных в яркие цвета. Отвечайте такими же цветными цифрами.",
    sample: [item(3, "a"), item(8, "a"), item(1, "a")],
  },
  mono: {
    title: "Монохромные цифры",
    lead: "Ряд из цифр одного тёмного цвета. Отвечайте такими же цифрами.",
    sample: [item(3, "a"), item(8, "a"), item(1, "a")],
  },
};

function rulesFor(kind: BlockKind) {
  const rules = ["Ряд виден несколько секунд, затем исчезает."];
  if (kind === "practice") {
    rules.push(`Пробный ряд из ${PRACTICE_LENGTH} элементов — чтобы освоиться. В результаты он не идёт.`);
  } else if (kind === "span") {
    rules.push(
      `После верного ответа ряд становится длиннее. Блок закончится после ${MAX_FAILS} ошибок подряд.`,
    );
  } else {
    rules.push(
      `${MIXED_ROUNDS} рядов по ${MIXED_LENGTH} элементов. Если помните не всё — введите, что запомнили, и нажмите «Готово».`,
    );
  }
  return rules;
}

type BlockIntroProps = {
  kind: BlockKind;
  condition: Condition;
  /** Номер блока в зачёте, с единицы; 0 — пробный. */
  number: number;
  total: number;
  onStart: () => void;
};

export function BlockIntroScreen({ kind, condition, number, total, onStart }: BlockIntroProps) {
  const text = BLOCK_TEXT[condition];
  return (
    <div className="space-y-8 pt-8 sm:pt-12">
      <div className="space-y-3">
        <Eyebrow>{kind === "practice" ? "Пробный ряд" : `Блок ${number} из ${total}`}</Eyebrow>
        <h2 className="text-3xl font-semibold tracking-tight">
          {kind === "practice" ? "Попробуем на цифрах" : text.title}
        </h2>
        <p className="max-w-prose leading-relaxed text-muted">{text.lead}</p>
      </div>

      <div className="flex items-center justify-center gap-4 rounded-3xl border border-line bg-surface py-8">
        {text.sample.map((it, i) => (
          <Glyph key={i} item={it} color={glyphColor(it, condition)} className="size-14 sm:size-16" />
        ))}
      </div>

      <ul className="space-y-2 text-[15px] leading-relaxed text-muted">
        {rulesFor(kind).map((rule) => (
          <li key={rule} className="flex gap-3">
            <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-faint" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>

      <Button autoFocus onClick={onStart} className="h-12 px-8 text-base">
        Начать
      </Button>
    </div>
  );
}

function ResultRow({
  label,
  shown,
  answer,
  condition,
}: {
  label: string;
  shown: readonly Item[];
  /** Если задан, каждая ячейка помечается верной или неверной относительно shown. */
  answer?: readonly Item[];
  condition: Condition;
}) {
  const cells = answer ? shown.map((_, i) => answer[i]) : shown;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <SequenceGrid count={shown.length} size={52} gap={8} align="start">
        {cells.map((cell, i) => {
          const tone = !answer
            ? "border-line bg-surface"
            : sameItem(shown[i], cell)
              ? "border-transparent bg-ok-soft"
              : "border-transparent bg-bad-soft";
          return (
            <div
              key={i}
              className={`aspect-square rounded-xl border p-1.5 ${cell ? "" : "border-dashed"} ${tone}`}
            >
              {cell && <Glyph item={cell} color={glyphColor(cell, condition)} className="size-full" />}
            </div>
          );
        })}
      </SequenceGrid>
    </div>
  );
}

type FeedbackProps = {
  condition: Condition;
  shown: readonly Item[];
  answer: readonly Item[];
  correct: boolean;
  timedOut: boolean;
  note: string;
  nextLabel: string;
  onNext: () => void;
};

export function FeedbackScreen(p: FeedbackProps) {
  const title = p.correct ? "Верно" : p.timedOut ? "Время вышло" : "Неверно";
  return (
    <div className="space-y-8 pt-8 sm:pt-12">
      <div className="space-y-2">
        <h2 className={`text-3xl font-semibold tracking-tight ${p.correct ? "text-ok" : "text-bad"}`}>
          {title}
        </h2>
        <p className="text-muted">{p.note}</p>
      </div>

      <div className="space-y-6 rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <ResultRow label="Было" shown={p.shown} condition={p.condition} />
        <ResultRow label="Ваш ответ" shown={p.shown} answer={p.answer} condition={p.condition} />
      </div>

      <Button autoFocus onClick={p.onNext} className="h-12 px-8 text-base">
        {p.nextLabel}
      </Button>
    </div>
  );
}

export function SavingScreen() {
  return (
    <div className="flex flex-col items-center gap-5 pt-28 text-center" role="status">
      <span className="size-8 animate-spin rounded-full border-2 border-line-strong border-t-ink" />
      <p className="text-muted">Сохраняем результаты…</p>
    </div>
  );
}

type ErrorProps = { message: string; onRetry: () => void; onDownload: () => void };

export function SaveErrorScreen({ message, onRetry, onDownload }: ErrorProps) {
  return (
    <div className="space-y-6 pt-16 sm:pt-24">
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold tracking-tight">Результат не сохранился</h2>
        <p className="max-w-prose leading-relaxed text-muted">
          {message} Не закрывайте страницу: попробуйте ещё раз или скачайте результат файлом и
          отправьте тому, кто проводит исследование.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onRetry} className="h-12 px-8 text-base">
          Повторить
        </Button>
        <Button variant="secondary" onClick={onDownload} className="h-12">
          Скачать JSON
        </Button>
      </div>
    </div>
  );
}
