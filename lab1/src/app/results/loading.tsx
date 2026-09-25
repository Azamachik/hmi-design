import { PageShell } from "@/components/results/primitives";

export default function Loading() {
  return (
    <PageShell>
      <div className="flex flex-col items-center gap-5 pt-24" role="status">
        <span className="size-8 animate-spin rounded-full border-2 border-line-strong border-t-ink" />
        <p className="text-muted">Загружаем результаты…</p>
      </div>
    </PageShell>
  );
}
