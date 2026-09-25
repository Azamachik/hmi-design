import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { buildFigures, FIGURE_KEYS } from "@/lib/analysis/figures";
import { buildReport, type GroupFilter, type HypothesisStatus } from "@/lib/analysis/report";
import {
  formatReportText,
  HYPOTHESIS_1,
  HYPOTHESIS_2,
  STATUS_TEXT,
} from "@/lib/analysis/text";
import { load } from "@/lib/db/load";
import { listSessions } from "@/lib/db/sessions";
import { CONDITION_LABEL, GROUP_LABEL } from "@/lib/experiment/labels";
import { num, percent } from "@/lib/format";
import { ComparisonCard } from "@/components/results/comparison-card";
import { FigureBlock } from "@/components/results/figure-block";
import { CopyButton } from "@/components/results/copy-button";
import { GroupTabs } from "@/components/results/group-tabs";
import { ParticipantsTable } from "@/components/results/participants-table";
import { PdfButton } from "@/components/results/pdf-button";
import {
  Badge,
  DataTable,
  EmptyState,
  PageShell,
  PageTitle,
} from "@/components/results/primitives";
import { Unavailable } from "@/components/results/unavailable";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = { title: "Результаты" };

// Шрифт подписей в диаграммах: переменная next/font задана на <html>, поэтому var() работает внутри инлайнового SVG.
const WEB_CHART_FONT = "var(--font-inter), ui-sans-serif, system-ui, sans-serif";

function HypothesisSection({
  index,
  title,
  status,
  children,
}: {
  index: number;
  title: string;
  status: HypothesisStatus;
  children: ReactNode;
}) {
  const verdict = STATUS_TEXT[status];
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted">Гипотеза {index}</p>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        </div>
        <Badge tone={verdict.tone}>{verdict.label}</Badge>
      </div>
      {children}
    </section>
  );
}

const exportLink = (kind: string, group: GroupFilter, label: string) => (
  <a
    key={kind}
    href={`/api/export?kind=${kind}${group === "all" ? "" : `&group=${group}`}`}
    download
    className={buttonStyles("secondary", "h-10")}
  >
    {label}
  </a>
);

export default async function ResultsPage({ searchParams }: PageProps<"/results">) {
  await connection();
  const params = await searchParams;
  const g = Array.isArray(params.group) ? params.group[0] : params.group;
  const groupFilter: GroupFilter = g === "test" || g === "control" ? g : "all";

  const loaded = await load(listSessions);
  if (loaded.state !== "ok") return <Unavailable reason={loaded.state} />;

  const sessions = loaded.data;
  if (sessions.length === 0) {
    return (
      <PageShell>
        <PageTitle title="Результаты" />
        <EmptyState title="Пока нет результатов">
          <p>Здесь появится сводка, как только кто-нибудь пройдёт тест до конца.</p>
        </EmptyState>
        <div className="flex justify-center">
          <Link href="/" className={buttonStyles()}>
            Пройти тест
          </Link>
        </div>
      </PageShell>
    );
  }

  const counts: Record<GroupFilter, number> = {
    all: sessions.length,
    test: sessions.filter((s) => s.group === "test").length,
    control: sessions.filter((s) => s.group === "control").length,
  };
  const scoped = groupFilter === "all" ? sessions : sessions.filter((s) => s.group === groupFilter);
  const groupLabel = groupFilter === "all" ? null : GROUP_LABEL[groupFilter];

  if (scoped.length === 0) {
    return (
      <PageShell>
        <PageTitle title="Результаты" actions={<GroupTabs active={groupFilter} counts={counts} />} />
        <EmptyState title={`${groupLabel} — пока пусто`}>
          <p>Здесь появится сводка, как только кто-нибудь из этой группы пройдёт тест до конца.</p>
        </EmptyState>
      </PageShell>
    );
  }

  const report = buildReport(scoped);
  const figures = buildFigures(report, WEB_CHART_FONT);
  const { mixed } = report;
  const rate = (hit: number, of: number) => percent(of ? (hit / of) * 100 : 0);

  return (
    <PageShell>
      <PageTitle
        title="Результаты"
        subtitle={`Участников: ${report.participants}${groupLabel ? ` · ${groupLabel}` : ""}`}
        actions={<GroupTabs active={groupFilter} counts={counts} />}
      />

      <div className="flex flex-wrap gap-2">
        <PdfButton report={report} groupLabel={groupLabel} />
        <CopyButton text={formatReportText(report, groupLabel)} label="Копировать сводку" />
        {exportLink("participants", groupFilter, "CSV участников")}
        {exportLink("trials", groupFilter, "CSV попыток")}
        {exportLink("json", groupFilter, "JSON")}
      </div>

      <HypothesisSection index={1} title={HYPOTHESIS_1} status={report.h1.status}>
        <ComparisonCard comparison={report.h1.seq} />
        <ComparisonCard comparison={report.h1.mixed} />
      </HypothesisSection>

      <HypothesisSection index={2} title={HYPOTHESIS_2} status={report.h2.status}>
        <ComparisonCard comparison={report.h2.color} />
      </HypothesisSection>

      <section className="space-y-8">
        <h2 className="text-2xl font-semibold tracking-tight">Диаграммы</h2>
        {FIGURE_KEYS.map((key) => figures[key]).map(
          (figure) => figure && <FigureBlock key={figure.key} figure={figure} />,
        )}
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight">Таблицы</h2>

        <DataTable
          caption="Таблица 1 — Длина воспроизведённого ряда по условиям"
          head={["Условие", "n", "Среднее ± σ", "Медиана", "Мин–макс", "На своих местах", "Ответ, с"]}
          rows={report.conditions.map((c) => [
            CONDITION_LABEL[c.condition],
            c.span.n,
            c.span.n ? `${num(c.span.mean)} ± ${num(c.span.sd)}` : "—",
            c.span.n ? num(c.span.median) : "—",
            c.span.n ? `${c.span.min}–${c.span.max}` : "—",
            c.span.n ? percent(c.accuracy) : "—",
            c.span.n ? num(c.answerSec) : "—",
          ])}
        />

        {mixed && (
          <DataTable
            caption="Таблица 2 — Смешанные ряды: что и как воспроизводили"
            head={["", "Арабские цифры", "Пиктограммы"]}
            rows={[
              ["Показано элементов", mixed.shown.a, mixed.shown.p],
              [
                "Верно воспроизведено (значение и вид)",
                `${mixed.recalled.a} · ${rate(mixed.recalled.a, mixed.shown.a)}`,
                `${mixed.recalled.p} · ${rate(mixed.recalled.p, mixed.shown.p)}`,
              ],
              ["Стоят на своём месте", mixed.placed.a, mixed.placed.p],
              ["Значение вспомнили, вид перепутали", mixed.swapped.a, mixed.swapped.p],
              ["Набрано в ответах (по нажатым клавишам)", mixed.inAnswer.a, mixed.inAnswer.p],
            ]}
          />
        )}

        <ParticipantsTable
          caption="Таблица 3 — Результаты участников"
          rows={report.rows}
          showGroup={groupFilter === "all"}
        />
      </section>
    </PageShell>
  );
}
