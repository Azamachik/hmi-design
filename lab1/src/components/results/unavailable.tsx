import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState, PageShell } from "./primitives";

export function Unavailable({ reason }: { reason: "no-db" | "error" }) {
  return (
    <PageShell>
      {reason === "no-db" ? (
        <EmptyState title="База данных не подключена">
          <p>
            Задайте переменную окружения <b className="text-ink">DATABASE_URL</b> со строкой
            подключения Neon и перезапустите приложение. Тест при этом работает, но результаты
            некуда сохранять.
          </p>
          <p>Подробности — в README.</p>
        </EmptyState>
      ) : (
        <EmptyState title="Не удалось прочитать результаты">
          <p>База данных не ответила. Обновите страницу через минуту.</p>
        </EmptyState>
      )}
      <div className="flex justify-center">
        <Link href="/" className={buttonStyles("secondary")}>
          К тесту
        </Link>
      </div>
    </PageShell>
  );
}
