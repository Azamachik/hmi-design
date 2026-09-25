import Link from "next/link";
import type { GroupFilter } from "@/lib/analysis/report";

const TABS: { key: GroupFilter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "test", label: "Тестовая группа" },
  { key: "control", label: "Контрольная (авторы)" },
];

export function GroupTabs({
  active,
  counts,
}: {
  active: GroupFilter;
  counts: Record<GroupFilter, number>;
}) {
  return (
    <nav className="flex flex-wrap gap-1">
      {TABS.map(({ key, label }) => (
        <Link
          key={key}
          href={key === "all" ? "/results" : `/results?group=${key}`}
          aria-current={active === key ? "page" : undefined}
          className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
            active === key ? "bg-ink text-surface" : "text-muted hover:bg-soft hover:text-ink"
          }`}
        >
          {label} <span className="tabular">{counts[key]}</span>
        </Link>
      ))}
    </nav>
  );
}
