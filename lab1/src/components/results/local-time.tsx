"use client";

import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/format";

const subscribe = () => () => {};

/** Дата в часовом поясе зрителя: на сервере он неизвестен, поэтому после гидратации пересчитывается. */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => formatDate(iso),
    () => formatDate(iso, "UTC"),
  );
  return <time dateTime={iso}>{text}</time>;
}
