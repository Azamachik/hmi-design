import { participantsCsv, trialsCsv } from "@/lib/analysis/csv";
import { isDbConfigured } from "@/lib/db/client";
import { listSessions } from "@/lib/db/sessions";

const KINDS = {
  participants: { file: "lab1-participants.csv", type: "text/csv; charset=utf-8" },
  trials: { file: "lab1-trials.csv", type: "text/csv; charset=utf-8" },
  json: { file: "lab1-sessions.json", type: "application/json; charset=utf-8" },
} as const;

/** ?kind=participants | trials | json */
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") ?? "participants";
  if (!(kind in KINDS)) return new Response("Unknown kind", { status: 400 });
  if (!isDbConfigured()) return new Response("База данных не подключена", { status: 503 });

  const sessions = await listSessions().catch((error) => {
    console.error("export failed", error);
    return null;
  });
  if (!sessions) return new Response("Не удалось прочитать базу данных", { status: 502 });

  const { file, type } = KINDS[kind as keyof typeof KINDS];
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
