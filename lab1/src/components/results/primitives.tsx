import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/analysis/text";

const TONE_CLASS: Record<Tone, string> = {
  good: "bg-ok-soft text-ok",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-soft text-muted",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-line bg-surface p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="tabular text-2xl font-semibold tracking-tight">{value}</dd>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

type TableProps = {
  caption: string;
  head: ReactNode[];
  rows: ReactNode[][];
};

/** Таблица с подписью «Таблица N — …» задаётся вызывающим. Первая колонка — подписи строк. */
export function DataTable({ caption, head, rows }: TableProps) {
  return (
    <figure className="space-y-3">
      <figcaption className="text-sm font-medium">{caption}</figcaption>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="tabular w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              {head.map((h, i) => (
                <th key={i} className={`px-3 py-3 font-medium sm:px-4 ${i ? "text-right" : "min-w-28"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b border-line last:border-0">
                {row.map((value, i) => (
                  <td
                    key={i}
                    className={`px-3 py-3 sm:px-4 ${i ? "whitespace-nowrap text-right" : "font-medium"}`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export function SiteHeader({ current }: { current: "test" | "results" }) {
  const link = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
        active ? "bg-ink text-surface" : "text-muted hover:bg-soft hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 pt-5 sm:px-6">
      <span className="font-semibold tracking-tight">ЛР 1</span>
      <nav className="flex gap-1">
        {link("/", "Тест", current === "test")}
        {link("/results", "Результаты", current === "results")}
      </nav>
    </header>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader current="results" />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-12 px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        {children}
      </main>
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-3 py-10 text-center">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mx-auto max-w-md space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </Card>
  );
}
