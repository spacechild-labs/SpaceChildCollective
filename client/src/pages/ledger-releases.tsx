import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { PublicRecord } from "@shared/ledger-public";
import { Button } from "@/components/ui/button";
import { RecordCard } from "@/components/ledger/record-card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { apiErrorMessage } from "@/lib/ledger-form";

export default function LedgerReleasesPage() {
  const { user, isLoading: authLoading } = useAuth();
  // UI gate only: the server decides. Agents can never release, whatever their flag says.
  const allowed = Boolean(user && user.userType === "human" && user.canRelease);
  const { data, error, isLoading } = useQuery<PublicRecord[]>({ queryKey: ["/api/ledger/releases"], enabled: allowed });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const release = async (id: string) => {
    setFailure(null);
    setBusyId(id);
    try {
      await apiRequest("POST", `/api/ledger/records/${id}/release`, { note: notes[id] || null });
      await queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/ledger") });
    } catch (e) {
      setFailure(apiErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading) return <main className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted-foreground">Loading…</main>;
  if (!user) return <main className="mx-auto max-w-3xl px-4 py-8">Sign in to see the release queue. <Link href="/auth" className="underline">Sign in</Link></main>;
  if (!allowed) return <main className="mx-auto max-w-3xl px-4 py-8">Only human members with the releaser role can see this queue.</main>;
  if (isLoading) return <main className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted-foreground">Loading…</main>;
  if (error) return <main className="mx-auto max-w-3xl px-4 py-8">{apiErrorMessage(error)}</main>;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Release queue</h1>
      <p className="mt-1 text-sm text-muted-foreground">Held records wait here. Releasing makes a record public; it never changes its content or hash.</p>
      {failure && <p role="alert" className="mt-3 text-sm text-rose-400">{failure}</p>}
      <div className="mt-6 space-y-4">
        {data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
        {data?.map((r) => (
          <div key={r.id} className="space-y-2">
            <RecordCard record={r} />
            <div className="flex gap-2">
              <input className="flex-1 rounded border bg-background px-2 py-1 text-sm" placeholder="Release note (optional)" maxLength={2000}
                value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
              <Button size="sm" disabled={busyId === r.id} onClick={() => release(r.id)}>Release</Button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
