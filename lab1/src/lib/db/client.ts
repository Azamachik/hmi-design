import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Vercel-интеграция с Neon кладёт строку подключения в DATABASE_URL (и дублирует в POSTGRES_URL).
const connectionString = () => process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export const isDbConfigured = () => Boolean(connectionString());

export class DbNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL не задан");
  }
}

let client: NeonQueryFunction<false, false> | undefined;

export function getDb() {
  const url = connectionString();
  if (!url) throw new DbNotConfiguredError();
  client ??= neon(url);
  return client;
}

/** Выполняет запрос и возвращает строки; форму строк задаёт вызывающий. */
export async function select<Row>(text: string, params: unknown[] = []) {
  return (await getDb().query(text, params)) as unknown as Row[];
}

const SCHEMA = [
  `create table if not exists sessions (
    id uuid primary key,
    created_at timestamptz not null default now(),
    name text,
    group_name text not null default 'test',
    block_order jsonb not null,
    settings jsonb not null,
    device jsonb
  )`,
  // Для баз, где таблица sessions создана более ранней версией схемы (без group_name).
  `alter table sessions add column if not exists group_name text not null default 'test'`,
  `create table if not exists trials (
    id bigserial primary key,
    session_id uuid not null references sessions (id) on delete cascade,
    seq int not null,
    test text not null,
    condition text not null,
    idx int not null,
    length int not null,
    shown jsonb not null,
    answer jsonb not null,
    correct boolean not null,
    answer_ms int not null,
    timed_out boolean not null default false
  )`,
  `create index if not exists trials_session_id_idx on trials (session_id)`,
];

let schemaReady: Promise<void> | undefined;

/** Таблицы создаются при первом обращении, отдельной миграции не требуется. */
export function ensureSchema() {
  schemaReady ??= (async () => {
    const db = getDb();
    for (const statement of SCHEMA) await db.query(statement);
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}
