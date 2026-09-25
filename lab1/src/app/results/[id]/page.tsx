import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { summarizeSession } from "@/lib/analysis/summary";
import { load } from "@/lib/db/load";
import { getSession } from "@/lib/db/sessions";
import { CONDITION_LABEL, GROUP_LABEL } from "@/lib/experiment/labels";
import type { Condition } from "@/lib/experiment/types";
import { percent } from "@/lib/format";
import { LocalTime } from "@/components/results/local-time";
import { Card, PageShell, PageTitle, Stat } from "@/components/results/primitives";
import { TrialsTable } from "@/components/results/trials-table";
import { Unavailable } from "@/components/results/unavailable";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = { title: "Результат участника" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ParticipantPage({ params }: PageProps<"/results/[id]">) {
  await connection();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const loaded = await load(() => getSession(id));
  if (loaded.state !== "ok") return <Unavailable reason={loaded.state} />;
  const session = loaded.data;
  if (!session) notFound();

  const s = summarizeSession(session.trials);
  const span = (value: number | undefined) => (value === undefined ? "—" : String(value));
  const rate = (hit: number | undefined, of: number | undefined) =>
    hit === undefined || !of ? "—" : percent((hit / of) * 100);
  const order = (conditions: Condition[]) => conditions.map((c) => CONDITION_LABEL[c]).join(" → ");

  return (
    <PageShell>
      <PageTitle
        title={session.name ?? "Участник без имени"}
        subtitle={
          <>
            <LocalTime iso={session.createdAt} />
            {` · ${GROUP_LABEL[session.group]}`}
            {session.device && ` · ${session.device.touch ? "сенсорный экран" : "компьютер"}, ${session.device.w}×${session.device.h}`}
          </>
        }
        actions={
          <Link href="/results" className={buttonStyles("secondary", "h-10")}>
            Все результаты
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="space-y-5">
          <p className="text-sm font-medium text-muted">Тест 1 · длина ряда</p>
          <dl className="grid grid-cols-2 gap-4">
            <Stat label="Цифры" value={span(s.seq.arabic?.span)} />
            <Stat label="Пиктограммы" value={span(s.seq.picto?.span)} />
          </dl>
          <p className="text-xs text-muted">{order(session.blockOrder.seq)}</p>
        </Card>

        <Card className="space-y-5">
          <p className="text-sm font-medium text-muted">Тест 2 · смешанные ряды</p>
          <dl className="grid grid-cols-2 gap-4">
            <Stat label="Цифры" value={rate(s.mixed?.recalled.a, s.mixed?.shown.a)} />
            <Stat label="Пиктограммы" value={rate(s.mixed?.recalled.p, s.mixed?.shown.p)} />
          </dl>
          <p className="text-xs text-muted">доля верно воспроизведённых элементов</p>
        </Card>

        <Card className="space-y-5">
          <p className="text-sm font-medium text-muted">Тест 3 · длина ряда</p>
          <dl className="grid grid-cols-2 gap-4">
            <Stat label="Яркие" value={span(s.color.colored?.span)} />
            <Stat label="Монохромные" value={span(s.color.mono?.span)} />
          </dl>
          <p className="text-xs text-muted">{order(session.blockOrder.color)}</p>
        </Card>
      </div>

      <TrialsTable caption="Все попытки по порядку" trials={session.trials} />
    </PageShell>
  );
}
