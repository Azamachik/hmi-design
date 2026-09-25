import type {
  BlockOrder,
  Condition,
  Device,
  Item,
  SessionPayload,
  Settings,
  StoredSession,
  TestId,
  TrialRecord,
} from "@/lib/experiment/types";
import { ensureSchema, getDb, select } from "./client";

// Одним запросом: если сессия с таким id уже есть (повторная отправка), попытки не дублируются.
export const INSERT_SESSION = `
  with s as (
    insert into sessions (id, name, block_order, settings, device)
    values ($1::uuid, $2::text, $3::jsonb, $4::jsonb, $5::jsonb)
    on conflict (id) do nothing
    returning id
  )
  insert into trials (session_id, seq, test, condition, idx, length, shown, answer, correct, answer_ms, timed_out)
  select s.id, t.seq, t.test, t.condition, t.idx, t.length, t.shown, t.answer, t.correct, t.answer_ms, t.timed_out
  from s, jsonb_to_recordset($6::jsonb) as t(
    seq int, test text, condition text, idx int, length int,
    shown jsonb, answer jsonb, correct boolean, answer_ms int, timed_out boolean
  )
`;

// Дата — готовой ISO-строкой, чтобы не зависеть от того, как драйвер разбирает timestamptz.
const SELECT_SESSIONS = `
  select id,
         to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
         name, block_order, settings, device
  from sessions
`;

const SELECT_TRIALS = `
  select session_id, seq, test, condition, idx, length, shown, answer, correct, answer_ms, timed_out
  from trials
`;

type SessionRow = {
  id: string;
  created_at: string;
  name: string | null;
  block_order: BlockOrder;
  settings: Settings;
  device: Device | null;
};

type TrialRow = {
  session_id: string;
  seq: number;
  test: TestId;
  condition: Condition;
  idx: number;
  length: number;
  shown: Item[];
  answer: Item[];
  correct: boolean;
  answer_ms: number;
  timed_out: boolean;
};

function toTrialRow(t: TrialRecord) {
  return {
    seq: t.seq,
    test: t.test,
    condition: t.condition,
    idx: t.idx,
    length: t.length,
    shown: t.shown,
    answer: t.answer,
    correct: t.correct,
    answer_ms: t.answerMs,
    timed_out: t.timedOut,
  };
}

function toTrial(row: TrialRow): TrialRecord {
  return {
    seq: row.seq,
    test: row.test,
    condition: row.condition,
    idx: row.idx,
    length: row.length,
    shown: row.shown,
    answer: row.answer,
    correct: row.correct,
    answerMs: row.answer_ms,
    timedOut: row.timed_out,
  };
}

function toSession(row: SessionRow, trials: TrialRecord[]): StoredSession {
  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    blockOrder: row.block_order,
    settings: row.settings,
    device: row.device,
    trials,
  };
}

export async function insertSession(session: SessionPayload) {
  await ensureSchema();
  await getDb().query(INSERT_SESSION, [
    session.id,
    session.name,
    JSON.stringify(session.blockOrder),
    JSON.stringify(session.settings),
    session.device ? JSON.stringify(session.device) : null,
    JSON.stringify(session.trials.map(toTrialRow)),
  ]);
}

export async function listSessions(): Promise<StoredSession[]> {
  await ensureSchema();
  const [sessions, trials] = await Promise.all([
    select<SessionRow>(`${SELECT_SESSIONS} order by created_at, id`),
    select<TrialRow>(`${SELECT_TRIALS} order by session_id, seq`),
  ]);

  const bySession = new Map<string, TrialRecord[]>();
  for (const row of trials) {
    const list = bySession.get(row.session_id) ?? [];
    list.push(toTrial(row));
    bySession.set(row.session_id, list);
  }
  return sessions.map((row) => toSession(row, bySession.get(row.id) ?? []));
}

export async function getSession(id: string): Promise<StoredSession | null> {
  await ensureSchema();
  const [sessions, trials] = await Promise.all([
    select<SessionRow>(`${SELECT_SESSIONS} where id = $1::uuid`, [id]),
    select<TrialRow>(`${SELECT_TRIALS} where session_id = $1::uuid order by seq`, [id]),
  ]);
  return sessions[0] ? toSession(sessions[0], trials.map(toTrial)) : null;
}
