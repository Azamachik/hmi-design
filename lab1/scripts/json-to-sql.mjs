#!/usr/bin/env node
// Превращает JSON результата (кнопка «Скачать JSON» на экране «Результат не сохранился») в SQL,
// который вставляется в SQL Editor в консоли Neon. Повторный запуск того же файла ничего не дублирует.
//
//   node scripts/json-to-sql.mjs ~/Downloads/lab1-xxxxxxxx.json [ещё.json ...] > import.sql
//
// Дату записи берём из времени изменения файла: JSON скачивают сразу после прохождения,
// и по нему участники встают в таблице в правильном порядке.
import { readFileSync, statSync } from "node:fs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GROUPS = ["test", "control"];
const TESTS = ["seq", "mixed", "color"];
const CONDITIONS = ["picto", "arabic", "mixed", "colored", "mono"];
const FORMS = ["a", "p"];

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Использование: node scripts/json-to-sql.mjs <файл.json> [ещё.json ...] > import.sql");
  process.exit(1);
}

function fail(file, message) {
  throw new Error(`${file}: ${message}`);
}

/** То же, что проверяет сервер перед записью: в базу не должно попасть ничего, кроме результата теста. */
function check(s, file) {
  if (typeof s !== "object" || s === null) fail(file, "это не результат теста");
  if (!UUID.test(s.id)) fail(file, "id не похож на UUID");
  if (!GROUPS.includes(s.group)) fail(file, `неизвестная группа: ${s.group}`);
  if (s.name != null && (typeof s.name !== "string" || s.name.length > 60)) fail(file, "некорректное имя");
  for (const key of ["blockOrder", "settings"]) {
    if (typeof s[key] !== "object" || s[key] === null) fail(file, `нет поля ${key}`);
  }
  if (!Array.isArray(s.trials) || s.trials.length < 1 || s.trials.length > 200) fail(file, "некорректный список попыток");

  for (const t of s.trials) {
    if (!TESTS.includes(t.test) || !CONDITIONS.includes(t.condition)) fail(file, `попытка ${t.seq}: неизвестный тест или условие`);
    for (const key of ["seq", "idx", "length", "answerMs"]) {
      if (!Number.isInteger(t[key]) || t[key] < 0) fail(file, `попытка ${t.seq}: поле ${key} не число`);
    }
    if (typeof t.timedOut !== "boolean") fail(file, `попытка ${t.seq}: нет timedOut`);
    for (const list of [t.shown, t.answer]) {
      const okList =
        Array.isArray(list) &&
        list.length <= 10 &&
        list.every((i) => Number.isInteger(i.v) && i.v >= 0 && i.v <= 9 && FORMS.includes(i.f));
      if (!okList) fail(file, `попытка ${t.seq}: некорректный ряд`);
    }
    if (t.shown.length !== t.length || t.answer.length > t.length) fail(file, `попытка ${t.seq}: длина ряда не совпадает`);
  }
}

/** Верность считаем сами, как сервер, а не берём из файла. */
const isExact = (shown, answer) =>
  shown.length === answer.length && shown.every((s, i) => s.v === answer[i].v && s.f === answer[i].f);

const quote = (text) => `'${String(text).replaceAll("'", "''")}'`;

/** JSON целиком в долларовых кавычках: внутри не нужно экранировать ни кавычки, ни слэши. */
function json(value, file) {
  const text = JSON.stringify(value);
  if (text.includes("$data$")) fail(file, "в данных встретилась последовательность $data$");
  return `$data$${text}$data$::jsonb`;
}

function sessionSql(file) {
  const s = JSON.parse(readFileSync(file, "utf8"));
  check(s, file);

  const trials = s.trials.map((t) => ({
    seq: t.seq,
    test: t.test,
    condition: t.condition,
    idx: t.idx,
    length: t.length,
    shown: t.shown,
    answer: t.answer,
    correct: isExact(t.shown, t.answer),
    answer_ms: t.answerMs,
    timed_out: t.timedOut,
  }));
  const createdAt = statSync(file).mtime.toISOString();
  const label = `${s.name ?? "без имени"} · ${s.group} · ${s.id} · попыток: ${trials.length}`.replace(/[\r\n]+/g, " ");

  const id = `${quote(s.id)}::uuid`;

  // Два независимых запроса: попытки вставляются, только если у сессии их ещё нет, поэтому второй
  // запрос можно запускать отдельно (например, когда строка в sessions уже создана вручную).
  return [
    `-- ${label}`,
    "insert into sessions (id, created_at, name, group_name, block_order, settings, device)",
    `values (${id}, ${quote(createdAt)}::timestamptz, ${s.name ? quote(s.name) : "null"}, ${quote(s.group)}, ${json(s.blockOrder, file)}, ${json(s.settings, file)}, ${s.device ? json(s.device, file) : "null"})`,
    "on conflict (id) do nothing;",
    "",
    "insert into trials (session_id, seq, test, condition, idx, length, shown, answer, correct, answer_ms, timed_out)",
    `select ${id}, t.seq, t.test, t.condition, t.idx, t.length, t.shown, t.answer, t.correct, t.answer_ms, t.timed_out`,
    `from jsonb_to_recordset(${json(trials, file)}) as t(`,
    "  seq int, test text, condition text, idx int, length int,",
    "  shown jsonb, answer jsonb, correct boolean, answer_ms int, timed_out boolean",
    ")",
    `where not exists (select 1 from trials where session_id = ${id});`,
  ].join("\n");
}

try {
  console.log("-- Вставить целиком в SQL Editor в Neon и нажать Run. Повторный запуск дублей не создаёт.");
  // Столбец group_name приложение добавляет само при первом обращении; здесь — на случай, если ещё не добавило.
  console.log("alter table sessions add column if not exists group_name text not null default 'test';\n");
  console.log(files.map(sessionSql).join("\n\n"));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
