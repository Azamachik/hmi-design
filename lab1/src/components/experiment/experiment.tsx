"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useReducer, type ReactNode } from "react";
import { saveSession } from "@/app/actions";
import { Glyph } from "@/components/glyph";
import { Button } from "@/components/ui/button";
import { exposureMs, MIXED_ROUNDS, READY_MS } from "@/lib/experiment/config";
import { glyphColor } from "@/lib/experiment/palette";
import {
  currentBlock,
  reduce,
  scoredBlockCount,
  toPayload,
  type Action,
  type Phase,
  type Session,
} from "@/lib/experiment/session";
import type { Device, SessionPayload } from "@/lib/experiment/types";
import { newId, randomSeed } from "@/lib/id";
import { AnswerSlots } from "./answer-slots";
import { Keypad } from "./keypad";
import {
  BlockIntroScreen,
  FeedbackScreen,
  IntroScreen,
  SaveErrorScreen,
  SavingScreen,
} from "./screens";
import { SequenceGrid } from "./sequence-grid";

type Props = {
  /** Время показа на один элемент, мс. */
  itemMs: number;
  /** Лимит времени на ответ, мс. */
  answerMs: number;
};

function readDevice(): Device {
  return {
    touch: window.matchMedia("(pointer: coarse)").matches,
    w: window.innerWidth,
    h: window.innerHeight,
  };
}

function downloadJson(payload: SessionPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lab1-${payload.id.slice(0, 8)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function feedbackNote(session: Session, phase: Extract<Phase, { name: "feedback" }>) {
  const { kind } = currentBlock(session);
  if (kind === "practice") return "Теперь начнём по-настоящему.";
  if (kind === "fixed") {
    return phase.blockDone
      ? "Блок завершён."
      : `Пройдено рядов: ${session.block.trial} из ${MIXED_ROUNDS}.`;
  }
  if (phase.blockDone) {
    return phase.correct ? "Достигнута максимальная длина, блок завершён." : "Две ошибки подряд, блок завершён.";
  }
  return phase.correct
    ? "Следующий ряд станет длиннее."
    : "Попробуем ещё раз: ряд той же длины, но другой.";
}

type ShellProps = {
  right?: ReactNode;
  /** Доля пройденных блоков, 0–1; без значения полоса не рисуется. */
  progress?: number;
  /** Пока ряд на экране, шапка скрыта, чтобы ничто не отвлекало. */
  quiet?: boolean;
  children: ReactNode;
};

function Shell({ right, progress, quiet, children }: ShellProps) {
  return (
    <div className="flex flex-1 flex-col">
      <header className={`mx-auto w-full max-w-2xl px-4 pt-5 sm:px-6 ${quiet ? "invisible" : ""}`}>
        <div className="flex h-8 items-center justify-between text-sm">
          <span className="font-semibold tracking-tight">ЛР 1</span>
          <span className="tabular text-muted">{right}</span>
        </div>
        {progress !== undefined && (
          <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-12 sm:px-6">{children}</main>
    </div>
  );
}

export function Experiment({ itemMs, answerMs }: Props) {
  const router = useRouter();
  const [session, dispatch] = useReducer(reduce, null);

  const phase = session?.phase;
  const phaseName = phase?.name;
  const trial = phase && "trial" in phase ? phase.trial : null;
  const trialKey = trial?.key ?? -1;
  const shownLength = trial?.shown.length ?? 0;

  useEffect(() => {
    const after = (ms: number, make: () => Action) => {
      const id = window.setTimeout(() => dispatch(make()), ms);
      return () => window.clearTimeout(id);
    };
    switch (phaseName) {
      case "ready":
        return after(READY_MS, () => ({ type: "expose" }));
      case "show":
        return after(exposureMs(shownLength, itemMs), () => ({
          type: "recall",
          now: performance.now(),
        }));
      case "answer":
        return after(answerMs, () => ({
          type: "submit",
          now: performance.now(),
          timedOut: true,
        }));
    }
  }, [phaseName, trialKey, shownLength, itemMs, answerMs]);

  useEffect(() => {
    if (phaseName !== "answer") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Backspace") return;
      e.preventDefault();
      dispatch({ type: "erase" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phaseName]);

  // Пока результат не сохранён, закрытие вкладки его потеряет.
  const started = session !== null;
  useEffect(() => {
    if (!started) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [started]);

  const save = useEffectEvent((signal: { cancelled: boolean }) => {
    if (!session) return;
    saveSession(toPayload(session, { itemMs, answerMs })).then(
      (result) => {
        if (signal.cancelled) return;
        if (result.ok) router.push(`/results/${result.id}`);
        else dispatch({ type: "save-failed", message: result.error });
      },
      () => {
        if (!signal.cancelled) {
          dispatch({ type: "save-failed", message: "Нет связи с сервером." });
        }
      },
    );
  });

  useEffect(() => {
    if (phaseName !== "saving") return;
    const signal = { cancelled: false };
    save(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [phaseName]);

  if (!session || !phase) {
    return (
      <Shell right={<Link href="/results">Результаты</Link>}>
        <IntroScreen
          onStart={(name) =>
            dispatch({
              type: "start",
              id: newId(),
              name: name || null,
              seed: randomSeed(),
              device: readDevice(),
            })
          }
        />
      </Shell>
    );
  }

  const def = currentBlock(session);
  const total = scoredBlockCount(session);
  const progressLabel = def.kind === "practice" ? "Пробный ряд" : `Блок ${session.blockIdx} из ${total}`;
  const shell = (children: ReactNode, quiet = false) => (
    <Shell
      right={progressLabel}
      progress={Math.max(0, session.blockIdx - 1) / total}
      quiet={quiet}
    >
      {children}
    </Shell>
  );

  switch (phase.name) {
    case "block-intro":
      return shell(
        <BlockIntroScreen
          kind={def.kind}
          condition={def.condition}
          number={session.blockIdx}
          total={total}
          onStart={() => dispatch({ type: "begin-block" })}
        />,
      );

    case "ready":
    case "show":
      return shell(
        <div className="flex min-h-[340px] select-none items-center justify-center rounded-3xl border border-line bg-surface p-4 sm:min-h-[420px] sm:p-8">
          {phase.name === "ready" ? (
            <span aria-hidden className="text-5xl font-light text-faint">
              +
            </span>
          ) : (
            <SequenceGrid count={phase.trial.shown.length}>
              {phase.trial.shown.map((item, i) => (
                <Glyph
                  key={i}
                  item={item}
                  color={glyphColor(item, def.condition)}
                  className="aspect-square size-full"
                />
              ))}
            </SequenceGrid>
          )}
        </div>,
        true,
      );

    case "answer":
      return shell(
        <div
          className={`mx-auto select-none space-y-6 pt-4 sm:pt-8 ${
            def.condition === "mixed" ? "max-w-2xl" : "max-w-md"
          }`}
        >
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Воспроизведите ряд</h2>
            <p className="text-sm text-muted">
              В том порядке, в каком он шёл: слева направо, сверху вниз.
            </p>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden>
            <div
              key={phase.trial.key}
              className="h-full origin-left rounded-full bg-ink/60"
              style={{ animation: `drain ${answerMs}ms linear forwards` }}
            />
          </div>
          <AnswerSlots
            length={phase.trial.shown.length}
            answer={phase.answer}
            condition={def.condition}
          />
          <Keypad condition={def.condition} onPick={(item) => dispatch({ type: "tap", item })} />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              disabled={!phase.answer.length}
              onClick={() => dispatch({ type: "erase" })}
            >
              Стереть
            </Button>
            <Button
              className="flex-1"
              onClick={() =>
                dispatch({ type: "submit", now: performance.now(), timedOut: false })
              }
            >
              Готово
            </Button>
          </div>
        </div>,
      );

    case "feedback": {
      const lastBlock = session.blockIdx + 1 >= session.plan.length;
      return shell(
        <FeedbackScreen
          condition={def.condition}
          shown={phase.trial.shown}
          answer={phase.answer}
          correct={phase.correct}
          timedOut={phase.timedOut}
          note={feedbackNote(session, phase)}
          nextLabel={phase.blockDone && lastBlock ? "Завершить" : "Дальше"}
          onNext={() => dispatch({ type: "next" })}
        />,
      );
    }

    case "saving":
      return shell(<SavingScreen />);

    case "error":
      return shell(
        <SaveErrorScreen
          message={phase.message}
          onRetry={() => dispatch({ type: "retry" })}
          onDownload={() => downloadJson(toPayload(session, { itemMs, answerMs }))}
        />,
      );
  }
}
