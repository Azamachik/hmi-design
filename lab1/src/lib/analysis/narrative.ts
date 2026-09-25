import { formatP, num, percent, plural } from "@/lib/format";
import type { Comparison, HypothesisStatus } from "./report";
import type { Series } from "./stats";

/** Названия условий в нужных падежах: по ним собираются связные предложения. */
export type Forms = { nom: string; gen: string; ins: string };

const FORMS: Record<string, Forms> = {
  "Арабские цифры": { nom: "арабские цифры", gen: "арабских цифр", ins: "арабскими цифрами" },
  Пиктограммы: { nom: "пиктограммы", gen: "пиктограмм", ins: "пиктограммами" },
  "Яркие цифры": { nom: "яркие цифры", gen: "ярких цифр", ins: "яркими цифрами" },
  "Монохромные цифры": {
    nom: "монохромные цифры",
    gen: "монохромных цифр",
    ins: "монохромными цифрами",
  },
};

export function formsOf(series: Series): Forms {
  const lower = series.label.toLowerCase();
  return FORMS[series.label] ?? { nom: lower, gen: lower, ins: lower };
}

const elementsWord = (x: number) =>
  Number.isInteger(x) ? plural(x, ["элемент", "элемента", "элементов"]) : "элемента";

const participantsGen = (n: number) => plural(n, ["участника", "участников", "участников"]);

export const participantsWord = (n: number) => plural(n, ["участник", "участника", "участников"]);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Что сравнивали и что получилось, по-русски. */
export function resultParagraph(c: Comparison) {
  if (c.verdict === "no-data") {
    return c.favored.n === 0
      ? "Пока нет участников, которые прошли оба условия этого теста."
      : "Пока есть данные только одного участника, а для сравнения нужно минимум два.";
  }

  const fav = formsOf(c.favored);
  const other = formsOf(c.other);
  const isPercent = c.unit === "%";
  const gap = Math.abs(c.favored.mean - c.other.mean);

  const means = isPercent
    ? `В смешанных рядах в среднем верно воспроизведено ${percent(c.favored.mean)} ${fav.gen} и ${percent(c.other.mean)} ${other.gen}.`
    : `В среднем ${fav.nom} воспроизводились до длины ${num(c.favored.mean)} ${elementsWord(c.favored.mean)}, ${other.nom} — до ${num(c.other.mean)} ${elementsWord(c.other.mean)}.`;

  const unit = isPercent ? "п. п." : elementsWord(gap);
  const difference =
    c.verdict === "equal"
      ? "Средние значения совпадают."
      : `Разница — ${num(gap)} ${unit} в пользу ${c.favored.mean > c.other.mean ? fav.gen : other.gen}.`;

  return `${means} ${difference}`;
}

/** Значима ли разница: словами, с числами в скобках. */
export function significanceParagraph(c: Comparison) {
  if (c.verdict === "no-data") return "";
  if (!c.t) return "Проверить значимость нельзя: для парного критерия нужно минимум два участника.";

  const t = Number.isFinite(c.t.t) ? num(c.t.t, 2) : "∞";
  const stat = `парный t-критерий: t(${c.t.df}) = ${t}, ${formatP(c.t.p)}`;
  if (c.t.p < 0.05) {
    return `Различие статистически значимо (${stat}): вряд ли оно случайно.`;
  }
  return `Различие статистически не значимо (${stat}): при таком числе участников его нельзя отличить от случайного.`;
}

/** Как распределились участники. */
export function peoplesParagraph(c: Comparison) {
  if (c.verdict === "no-data") return "";
  const fav = formsOf(c.favored);
  const other = formsOf(c.other);
  const n = c.favored.n;
  return (
    `С ${fav.ins} лучше справились ${c.wins} из ${n} ${participantsGen(n)}, ` +
    `с ${other.ins} — ${c.losses}, у ${c.ties} результаты одинаковые.`
  );
}

export type Claim = { fav: Forms; other: Forms };

/** Итоговый вывод по гипотезе. */
export function conclusionParagraph(status: HypothesisStatus, comparisons: Comparison[], claim: Claim) {
  const { fav, other } = claim;
  const single = comparisons.length === 1;
  const where = single ? "в тесте" : "во всех тестах";

  switch (status) {
    case "no-data":
      return "Для вывода пока мало данных: для сравнения условий нужно минимум два участника.";
    case "confirmed":
      return `Гипотеза подтверждается: ${where} ${fav.nom} воспроизводились лучше ${other.gen}, ${single ? "и различие статистически значимо" : "и различия статистически значимы"}.`;
    case "tendency":
      return `Гипотеза скорее подтверждается: ${where} ${fav.nom} воспроизводились лучше ${other.gen}, но значимость ${single ? "не достигнута" : "есть не везде"} — участников пока недостаточно для твёрдого вывода.`;
    case "partial":
      return `Гипотеза подтверждается частично: ${fav.nom} воспроизводились лучше ${other.gen} только в части тестов.`;
    case "rejected":
      return `Гипотеза не подтверждается: ${single ? "в тесте" : "ни в одном тесте"} ${fav.nom} не воспроизводились лучше ${other.gen}.`;
  }
}

export function sampleNote(participants: number) {
  // При одном участнике сравнения не строятся вовсе, и об этом уже сказано в итоге.
  if (participants < 2 || participants >= 10) return "";
  return `Выборка небольшая (${participants} ${participantsWord(participants)}), поэтому выводы предварительные: при малом числе участников значимые различия обнаруживаются редко.`;
}

/** Краткая расшифровка вердикта одной строкой для сводки в начале. */
export function statusSentence(status: HypothesisStatus, claim: Claim, tests: number) {
  const { fav, other } = claim;
  switch (status) {
    case "no-data":
      return "Данных пока мало: нужно минимум два участника.";
    case "confirmed":
    case "tendency":
      return `${capitalize(fav.nom)} воспроизводились лучше ${other.gen} ${tests === 1 ? "в тесте" : "во всех тестах"}.`;
    case "partial":
      return `${capitalize(fav.nom)} оказались лучше ${other.gen} не во всех тестах.`;
    case "rejected":
      return `${capitalize(fav.nom)} не оказались лучше ${other.gen} ${tests === 1 ? "в тесте" : "ни в одном тесте"}.`;
  }
}
