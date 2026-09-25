import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import {
  DEFAULT_ANSWER_MS,
  DEFAULT_ITEM_MS,
  MAX_FAILS,
  MAX_LENGTH,
  MIN_EXPOSURE_MS,
  MIXED_LENGTH,
  MIXED_ROUNDS,
  START_LENGTH,
} from "@/lib/experiment/config";
import { CONDITION_LABEL } from "@/lib/experiment/labels";
import { formatDate, num, percent, plural } from "@/lib/format";
import { buildFigures, figureNumber, type FigureKey } from "./figures";
import {
  conclusionParagraph,
  formsOf,
  participantsWord,
  peoplesParagraph,
  resultParagraph,
  sampleNote,
  significanceParagraph,
  statusSentence,
  type Claim,
} from "./narrative";
import type { Comparison, Report } from "./report";
import { HYPOTHESIS_1, HYPOTHESIS_2, STATUS_TEXT } from "./text";

/**
 * Оформление как у учебного отчёта: Times-совместимый шрифт 14 pt, интервал 1,5,
 * поля 30/15/20/20 мм, красная строка 1,25 см, подписи «Таблица N —» и «Рисунок N —».
 * Все размеры собраны здесь, чтобы подстроить под требования кафедры, не трогая содержание.
 */
export const PDF_FONT = "Tinos";

const MM = 72 / 25.4;
const PAGE = { width: 595.28, marginLeft: 30 * MM, marginRight: 15 * MM, marginTop: 20 * MM, marginBottom: 20 * MM };
const TEXT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight;
const INDENT = 12.5 * MM;
const BODY_SIZE = 14;
const LINE_HEIGHT = 1.5;
const TABLE_SIZE = 12;

const table = { conditions: 1, mixed: 2, participants: 3 } as const;
const fig = (key: FigureKey) => figureNumber(key);

const para = (text: string): Content =>
  text ? { text, alignment: "justify", leadingIndent: INDENT } : { text: "", margin: [0, 0, 0, 0] };

const dash = (text: string): Content => ({ text: `– ${text}`, alignment: "justify", leadingIndent: INDENT });

/** Раздел: заглавными, жирным, с красной строки. */
const heading = (number: string, title: string): Content => ({
  text: `${number} ${title.toUpperCase()}`,
  bold: true,
  margin: [INDENT, 14, 0, 6],
});

const subheading = (number: string, title: string): Content => ({
  text: `${number} ${title}`,
  bold: true,
  margin: [INDENT, 8, 0, 2],
});

/** Заголовок склеен со следующим блоком, чтобы не оставаться последней строкой страницы. */
const together = (...children: Content[]): Content => ({ unbreakable: true, stack: children });

const HAIRLINES = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 0 || i === node.table.body.length || i === 1 ? 0.75 : 0.4,
  vLineWidth: () => 0,
  hLineColor: () => "#444444",
  paddingTop: () => 3,
  paddingBottom: () => 3,
  paddingLeft: () => 4,
  paddingRight: () => 4,
};

/** Таблица: подпись сверху слева, текст 12 pt через одинарный интервал. */
function dataTable(
  number: number,
  caption: string,
  head: string[],
  rows: (string | number)[][],
  widths: (string | number)[],
): Content {
  const cell = (text: string | number, i: number, bold = false): TableCell => ({
    text: String(text),
    alignment: i ? "right" : "left",
    bold,
    fontSize: TABLE_SIZE,
    lineHeight: 1.1,
  });
  return {
    unbreakable: rows.length <= 14,
    margin: [0, 6, 0, 8],
    stack: [
      { text: `Таблица ${number} — ${caption}`, margin: [0, 0, 0, 4], lineHeight: 1.2 },
      {
        table: {
          headerRows: 1,
          widths,
          body: [head.map((h, i) => cell(h, i, true)), ...rows.map((row) => row.map((v, i) => cell(v, i)))],
        },
        layout: HAIRLINES,
      },
    ],
  };
}

const commentsOn = (c: Comparison) =>
  [resultParagraph(c), significanceParagraph(c), peoplesParagraph(c)].filter(Boolean).join(" ");

/** Сводный отчёт по образцу лабораторной работы: цель, гипотезы, методика, результаты, выводы. */
export function buildReportDocument(report: Report, generatedAt: Date): TDocumentDefinitions {
  const { h1, h2, mixed } = report;
  const claim1: Claim = { fav: formsOf(h1.seq.favored), other: formsOf(h1.seq.other) };
  const claim2: Claim = { fav: formsOf(h2.color.favored), other: formsOf(h2.color.other) };
  const s1 = STATUS_TEXT[h1.status];
  const s2 = STATUS_TEXT[h2.status];
  const sample = sampleNote(report.participants);
  const participants = `${report.participants} ${participantsWord(report.participants)}`;
  const figures = buildFigures(report, PDF_FONT);

  const figure = (key: FigureKey): Content => {
    const f = figures[key];
    if (!f) return { text: "" };
    return {
      unbreakable: true,
      margin: [0, 6, 0, 8],
      stack: [
        { svg: f.svg, width: TEXT_WIDTH, alignment: "center" },
        { text: `Рисунок ${f.number} — ${f.caption}`, alignment: "center", margin: [0, 2, 0, 0], lineHeight: 1.2 },
      ],
    };
  };

  const swapped = mixed
    ? `Значение вспомнили, но перепутали вид (цифру с пиктограммой): среди показанных цифр — ${mixed.swapped.a}, среди пиктограмм — ${mixed.swapped.p}.`
    : "";

  const content: Content[] = [
    { text: "ЛАБОРАТОРНАЯ РАБОТА №1", bold: true, alignment: "center" },
    { text: "Арабские цифры и пиктограммы: цветовое кодирование", bold: true, alignment: "center" },
    { text: "Вариант 7", alignment: "center" },
    {
      text: `Сводный отчёт по результатам ${participants}, ${formatDate(generatedAt.toISOString())}`,
      alignment: "center",
      margin: [0, 0, 0, 10],
    },

    together(
      heading("1", "Цель работы"),
      para(
        "Экспериментально сравнить, как запоминаются ряды, закодированные арабскими цифрами и пиктограммами, " +
          "и выяснить, влияет ли на запоминание цветовое кодирование цифр.",
      ),
    ),

    together(
      heading("2", "Гипотезы"),
      para(`Гипотеза 1. ${HYPOTHESIS_1}.`),
      para(`Гипотеза 2. ${HYPOTHESIS_2}.`),
    ),
    para(
      h1.status === "no-data" && h2.status === "no-data"
        ? `Итог эксперимента: данных пока мало — для сравнения условий нужно минимум два участника (сейчас ${report.participants}).`
        : `Итог эксперимента (${participants}): гипотеза 1 — ${s1.label.toLowerCase()}, гипотеза 2 — ${s2.label.toLowerCase()}. ` +
            `${statusSentence(h1.status, claim1, 2)} ${statusSentence(h2.status, claim2, 1)} ${sample}`.trim(),
    ),

    together(
      heading("3", "Методика"),
      para(
        "Участник запоминал ряды из цифр и пиктограмм и воспроизводил их по порядку, нажимая клавиши на экране. " +
          "Пиктограмма — квадрат с точками по числу цифры, пустой квадрат означает ноль. Значения в ряду не повторяются. " +
          "Ответ вводится клавишами того же вида, что и показанные элементы, поэтому пиктограммы не приходится переводить в цифры.",
      ),
    ),
    para("Эксперимент состоит из трёх тестов:"),
    dash(
      `тест 1 — ряды пиктограмм и ряды арабских цифр (два блока в случайном порядке). Ряд начинается с ${START_LENGTH} элементов и после каждого верного ответа становится на один длиннее, до ${MAX_LENGTH}. Блок завершается после ${MAX_FAILS} ${plural(MAX_FAILS, ["ошибки", "ошибок", "ошибок"])} подряд. Результат — наибольшая длина верно воспроизведённого ряда;`,
    ),
    dash(
      `тест 2 — ${MIXED_ROUNDS} рядов по ${MIXED_LENGTH} элементов, в которых цифры и пиктограммы перемешаны поровну. Считается доля элементов каждого вида, воспроизведённых верно (совпали и значение, и вид);`,
    ),
    dash(
      "тест 3 — то же, что тест 1, но только с цифрами: яркими (у каждой цифры свой цвет) и монохромными (тёмными).",
    ),
    para(
      `Ряд показывается целиком на ${num(DEFAULT_ITEM_MS / 1000, 1)} с на элемент (не меньше ${num(MIN_EXPOSURE_MS / 1000, 1)} с), ` +
        `на ответ отводится ${Math.round(DEFAULT_ANSWER_MS / 1000)} с. Порядок блоков внутри пар выбирается случайно для каждого участника, ` +
        "чтобы эффект тренировки не смешивался с различием условий. Так как каждый участник проходит оба условия, " +
        "их сравнивают парным t-критерием (двусторонний, уровень значимости 0,05). Запись «± σ» означает стандартное отклонение " +
        "между участниками; p — вероятность получить такую разницу случайно.",
    ),

    heading("4", "Результаты"),
    para(
      `Число участников — ${report.participants}. Общая картина по четырём условиям приведена на рисунке ${fig("overview")} и в таблице ${table.conditions}.`,
    ),
    figure("overview"),
    dataTable(
      table.conditions,
      "Длина воспроизведённого ряда по условиям",
      ["Условие", "n", "Среднее ± σ", "Медиана", "Мин–макс", "На своих местах", "Ответ, с"],
      report.conditions.map((c) => [
        CONDITION_LABEL[c.condition],
        c.span.n,
        c.span.n ? `${num(c.span.mean)} ± ${num(c.span.sd)}` : "—",
        c.span.n ? num(c.span.median) : "—",
        c.span.n ? `${c.span.min}–${c.span.max}` : "—",
        c.span.n ? percent(c.accuracy) : "—",
        c.span.n ? num(c.answerSec) : "—",
      ]),
      ["*", 22, 76, 52, 62, 58, 46],
    ),

    together(
      subheading("4.1", "Тест 1. Пиктограммы и арабские цифры"),
      para(`${commentsOn(h1.seq)} Результаты каждого участника показаны на рисунке ${fig("paired1")}.`),
    ),
    figure("paired1"),

    together(
      subheading("4.2", "Тест 2. Смешанные ряды"),
      para(
        `${commentsOn(h1.mixed)} ${swapped} Числовые данные приведены в таблице ${table.mixed}, ` +
          `доля верных ответов по позициям в ряду — на рисунке ${fig("position")}, а то, что происходило с элементами, — на рисунке ${fig("composition")}.`,
      ),
    ),
  ];

  if (mixed) {
    const rate = (hit: number, of: number) => percent(of ? (hit / of) * 100 : 0);
    content.push(
      dataTable(
        table.mixed,
        "Смешанные ряды: что и как воспроизводили",
        ["", "Арабские цифры", "Пиктограммы"],
        [
          ["Показано элементов", mixed.shown.a, mixed.shown.p],
          [
            "Верно воспроизведено (значение и вид)",
            `${mixed.recalled.a} · ${rate(mixed.recalled.a, mixed.shown.a)}`,
            `${mixed.recalled.p} · ${rate(mixed.recalled.p, mixed.shown.p)}`,
          ],
          ["Стоят на своём месте", mixed.placed.a, mixed.placed.p],
          ["Значение вспомнили, вид перепутали", mixed.swapped.a, mixed.swapped.p],
          ["Набрано в ответах (по нажатым клавишам)", mixed.inAnswer.a, mixed.inAnswer.p],
        ],
        ["*", 96, 84],
      ),
    );
  }

  content.push(
    figure("position"),
    figure("composition"),

    together(
      subheading("4.3", "Тест 3. Яркие и монохромные цифры"),
      para(`${commentsOn(h2.color)} Результаты каждого участника показаны на рисунке ${fig("paired3")}.`),
    ),
    figure("paired3"),

    together(
      subheading("4.4", "Дополнительные наблюдения"),
      para(
        `На рисунке ${fig("byLength")} показано, как доля верно воспроизведённых рядов зависит от их длины. ` +
          "Обычно с ростом длины ряда доля верных попыток снижается; на больших длинах попыток меньше, поэтому значения там менее надёжны. " +
          `На рисунке ${fig("digits")} — какие значения цифр воспроизводятся лучше и хуже в зависимости от вида элемента.`,
      ),
    ),
    figure("byLength"),
    figure("digits"),

    together(
      heading("5", "Выводы"),
      para(`По гипотезе 1. ${conclusionParagraph(h1.status, [h1.seq, h1.mixed], claim1)}`),
    ),
    para(`По гипотезе 2. ${conclusionParagraph(h2.status, [h2.color], claim2)}`),
    para("При интерпретации результатов следует учитывать:"),
    dash(
      "пиктограммы в работе — точечные «кости»; выводы относятся к такому кодированию и не обязательно переносятся на другие пиктограммы;",
    ),
    dash(
      "за каждой цифрой закреплён свой цвет, поэтому при вводе ответа цвет клавиши мог служить дополнительной подсказкой; так работает цветовое кодирование в интерфейсах, но эффект включает и это;",
    ),
    dash("участники проходили тест на разных устройствах и в разной обстановке."),
    ...(sample ? [para(sample)] : []),

    together(
      { text: "ПРИЛОЖЕНИЕ А", bold: true, alignment: "center", margin: [0, 14, 0, 2] },
      { text: "Результаты участников", alignment: "center", margin: [0, 0, 0, 6] },
    ),
    dataTable(
      table.participants,
      "Результаты участников (тесты 1 и 3 — наибольшая длина ряда, тест 2 — доля верных элементов)",
      ["№ Участник", "Т1 цифры", "Т1 пикт.", "Т2 цифры", "Т2 пикт.", "Т3 яркие", "Т3 монохр."],
      report.rows.map((r, i) => [
        `${i + 1}. ${r.name ?? "Без имени"}`,
        r.spanArabic ?? "—",
        r.spanPicto ?? "—",
        r.mixedArabic === null ? "—" : percent(r.mixedArabic),
        r.mixedPicto === null ? "—" : percent(r.mixedPicto),
        r.spanColored ?? "—",
        r.spanMono ?? "—",
      ]),
      ["*", 40, 40, 44, 44, 44, 50],
    ),
  );

  return {
    pageSize: "A4",
    pageMargins: [PAGE.marginLeft, PAGE.marginTop, PAGE.marginRight, PAGE.marginBottom],
    defaultStyle: { font: PDF_FONT, fontSize: BODY_SIZE, lineHeight: LINE_HEIGHT },
    info: {
      title: "ЛР 1 — сводный отчёт",
      subject: "Арабские цифры и пиктограммы, цветовое кодирование (вариант 7)",
    },
    content,
    footer: (page) => ({ text: String(page), alignment: "center", fontSize: 12, margin: [0, 18, 0, 0] }),
  };
}
