import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center gap-6 px-4 sm:px-6">
      <p className="text-sm font-medium text-muted">Ошибка 404</p>
      <h1 className="text-4xl font-semibold tracking-tight">Такой страницы нет</h1>
      <div className="flex gap-3">
        <Link href="/" className={buttonStyles()}>
          К тесту
        </Link>
        <Link href="/results" className={buttonStyles("secondary")}>
          Результаты
        </Link>
      </div>
    </main>
  );
}
