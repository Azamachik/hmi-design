import { participantsCsv, trialsCsv } from "@/lib/analysis/csv";
import { isDbConfigured } from "@/lib/db/client";
import { listSessions } from "@/lib/db/sessions";

const KINDS = {
  participants: { base: "lab1-participants", type: "text/csv; charset=utf-8", ext: "csv" },
  trials: { base: "lab1-trials", type: "text/csv; charset=utf-8", ext: "csv" },
  json: { base: "lab1-sessions", type: "application/json; charset=utf-8", ext: "json" },
} as const;

/** ?kind=participants | trials | json, необязательный ?group=test | control (по умолчанию — все). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "participants";
  const groupParam = url.searchParams.get("group");
  const group = groupParam === "test" || groupParam === "control" ? groupParam : null;
  if (!(kind in KINDS)) return new Response("Unknown kind", { status: 400 });
  if (!isDbConfigured()) return new Response("База данных не подключена", { status: 503 });

  const all = await listSessions().catch((error) => {
    console.error("export failed", error);
    return null;
  });
  if (!all) return new Response("Не удалось прочитать базу данных", { status: 502 });
  const sessions = group ? all.filter((s) => s.group === group) : all;

  const { base, type, ext } = KINDS[kind as keyof typeof KINDS];
  const file = `${base}${group ? `-${group}` : ""}.${ext}`;
  const body =
    kind === "json"
      ? JSON.stringify(sessions, null, 2)
      : kind === "trials"
        ? trialsCsv(sessions)
        : participantsCsv(sessions);

  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
