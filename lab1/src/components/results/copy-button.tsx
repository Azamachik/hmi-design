"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Нет доступа к буферу (http, старый браузер) — копируем через скрытое поле.
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  }
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  return (
    <Button
      variant="secondary"
      className="h-10"
      onClick={async () => {
        setState((await copy(text)) ? "done" : "failed");
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "done" ? "Скопировано" : state === "failed" ? "Не удалось" : label}
    </Button>
  );
}
