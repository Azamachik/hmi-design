import { advance, buildPlan, initialBlockState, type BlockDef, type BlockState } from "./engine";
import { createRng, makeBlockOrder, makeSequence } from "./generate";
import { isExact } from "./scoring";
import type {
  BlockOrder,
  Device,
  Group,
  Item,
  SessionPayload,
  Settings,
  TrialRecord,
} from "./types";

export type Trial = { key: number; shown: Item[] };

export type Phase =
  | { name: "block-intro" }
  | { name: "ready"; trial: Trial }
  | { name: "show"; trial: Trial }
  | { name: "answer"; trial: Trial; answer: Item[]; startedAt: number }
  | {
      name: "feedback";
      trial: Trial;
      answer: Item[];
      correct: boolean;
      timedOut: boolean;
      blockDone: boolean;
    }
  | { name: "saving" }
  | { name: "error"; message: string };

export type Session = {
  phase: Phase;
  id: string;
  name: string | null;
  group: Group;
  blockOrder: BlockOrder;
  plan: BlockDef[];
  blockIdx: number;
  /** Состояние блока после последнего ответа: длина следующего ряда, число ошибок подряд. */
  block: BlockState;
  records: TrialRecord[];
  trialCount: number;
  seed: number;
  device: Device | null;
};

export type Action =
  | {
      type: "start";
      id: string;
      name: string | null;
      group: Group;
      seed: number;
      device: Device | null;
    }
  | { type: "begin-block" }
  | { type: "expose" }
  | { type: "recall"; now: number }
  | { type: "tap"; item: Item }
  | { type: "erase" }
  | { type: "submit"; now: number; timedOut: boolean }
  | { type: "next" }
  | { type: "save-failed"; message: string }
  | { type: "retry" };

export const currentBlock = (s: Session) => s.plan[s.blockIdx];

/** Блоков, идущих в зачёт (без пробного). */
export const scoredBlockCount = (s: Session) => s.plan.length - 1;

function startSession(a: Extract<Action, { type: "start" }>): Session {
  const rng = createRng(a.seed);
  const blockOrder = makeBlockOrder(rng);
  const plan = buildPlan(blockOrder);
  return {
    phase: { name: "block-intro" },
    id: a.id,
    name: a.name,
    group: a.group,
    blockOrder,
    plan,
    blockIdx: 0,
    block: initialBlockState(plan[0]),
    records: [],
    trialCount: 0,
    seed: rng.state,
    device: a.device,
  };
}

function beginTrial(s: Session): Session {
  const rng = createRng(s.seed);
  const shown = makeSequence(currentBlock(s).condition, s.block.length, rng);
  const trial: Trial = { key: s.trialCount, shown };
  return { ...s, seed: rng.state, trialCount: s.trialCount + 1, phase: { name: "ready", trial } };
}

function submit(s: Session, phase: Extract<Phase, { name: "answer" }>, now: number, timedOut: boolean) {
  const def = currentBlock(s);
  const { trial, answer } = phase;
  const correct = isExact(trial.shown, answer);
  const { state, done } = advance(def, s.block, correct);
  const records =
    def.kind === "practice"
      ? s.records
      : [
          ...s.records,
          {
            seq: s.records.length,
            test: def.test,
            condition: def.condition,
            idx: s.block.trial,
            length: trial.shown.length,
            shown: trial.shown,
            answer,
            correct,
            answerMs: Math.max(0, Math.round(now - phase.startedAt)),
            timedOut,
          },
        ];
  return {
    ...s,
    block: state,
    records,
    phase: { name: "feedback", trial, answer, correct, timedOut, blockDone: done },
  } satisfies Session;
}

export function reduce(s: Session | null, a: Action): Session | null {
  if (a.type === "start") return startSession(a);
  if (!s) return s;
  const { phase } = s;

  switch (a.type) {
    case "begin-block":
      return phase.name === "block-intro" ? beginTrial(s) : s;
    case "expose":
      return phase.name === "ready" ? { ...s, phase: { name: "show", trial: phase.trial } } : s;
    case "recall":
      return phase.name === "show"
        ? { ...s, phase: { name: "answer", trial: phase.trial, answer: [], startedAt: a.now } }
        : s;
    case "tap":
      return phase.name === "answer" && phase.answer.length < phase.trial.shown.length
        ? { ...s, phase: { ...phase, answer: [...phase.answer, a.item] } }
        : s;
    case "erase":
      return phase.name === "answer" && phase.answer.length
        ? { ...s, phase: { ...phase, answer: phase.answer.slice(0, -1) } }
        : s;
    case "submit":
      return phase.name === "answer" ? submit(s, phase, a.now, a.timedOut) : s;
    case "next": {
      if (phase.name !== "feedback") return s;
      if (!phase.blockDone) return beginTrial(s);
      const blockIdx = s.blockIdx + 1;
      if (blockIdx >= s.plan.length) return { ...s, phase: { name: "saving" } };
      return {
        ...s,
        blockIdx,
        block: initialBlockState(s.plan[blockIdx]),
        phase: { name: "block-intro" },
      };
    }
    case "save-failed":
      return phase.name === "saving" ? { ...s, phase: { name: "error", message: a.message } } : s;
    case "retry":
      return phase.name === "error" ? { ...s, phase: { name: "saving" } } : s;
  }
}

export function toPayload(s: Session, settings: Settings): SessionPayload {
  return {
    id: s.id,
    name: s.name,
    group: s.group,
    blockOrder: s.blockOrder,
    settings,
    device: s.device,
    trials: s.records,
  };
}
