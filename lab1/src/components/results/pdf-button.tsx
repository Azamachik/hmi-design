"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Report } from "@/lib/analysis/report";

type State = "idle" | "busy" | "failed";

const two = (n: number) => String(n).padStart(2, "0");

// Tinos — метрический аналог Times New Roman (лицензия OFL), лежит в public/fonts и грузится только по клику.
const FONT_FILES = {
  normal: "/fonts/Tinos-Regular.ttf",
  bold: "/fonts/Tinos-Bold.ttf",
  italics: "/fonts/Tinos-Regular.ttf",
  bolditalics: "/fonts/Tinos-Bold.ttf",
};

/**
 * PDF собирается в браузере: библиотека и шрифт (около 1 МБ) подгружаются только по клику,
 * поэтому страница результатов остаётся лёгкой, а серверу не нужны ни шрифты, ни лишняя память.
 */
export function PdfButton({ report }: { report: Report }) {
  const [state, setState] = useState<State>("idle");

  async function download() {
    setState("busy");
    try {
      const [pdfMake, { buildReportDocument, PDF_FONT }] = await Promise.all([
        import("pdfmake/build/pdfmake"),
        import("@/lib/analysis/pdf"),
      ]);
      // Методы pdfmake пишут в this (например, addFonts), а объект-модуль только для чтения — нужен настоящий default.
      const api = pdfMake.default ?? pdfMake;
      const origin = window.location.origin;
      api.addFonts({
        [PDF_FONT]: Object.fromEntries(Object.entries(FONT_FILES).map(([style, path]) => [style, origin + path])),
      });

      const now = new Date();
      const day = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
      await api.createPdf(buildReportDocument(report, now)).download(`lab1-report-${day}.pdf`);
      setState("idle");
    } catch (error) {
      console.error("PDF export failed", error);
      setState("failed");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  return (
    <Button variant="secondary" className="h-10" disabled={state === "busy"} onClick={download}>
      {state === "busy" ? "Готовим PDF…" : state === "failed" ? "Не удалось" : "Скачать PDF"}
    </Button>
  );
}
