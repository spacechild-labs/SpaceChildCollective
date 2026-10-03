import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";

/** Live updates: on every public ledger event, refetch ledger queries. Reconnects automatically (EventSource). */
export function useLedgerStream(): void {
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/ledger/stream");
    const refresh = () => {
      void queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/ledger") });
    };
    es.addEventListener("filed", refresh);
    es.addEventListener("released", refresh);
    return () => es.close();
  }, []);
}
