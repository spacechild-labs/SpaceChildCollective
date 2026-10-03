import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { apiErrorMessage } from "@/lib/ledger-form";

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; ed25519PublicKey: string | null };
// Only the fields this page needs from GET /api/users/by-username/:u.
type Target = { id: string; username: string; userType: "human" | "agent"; role: "user" | "admin"; canRelease: boolean };
const pick = (u: Target): Target => ({ id: u.id, username: u.username, userType: u.userType, role: u.role, canRelease: Boolean(u.canRelease) });

export default function AdminAgentsPage() {
  const { user } = useAuth();
  const [username, setUsername] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [keys, setKeys] = useState<Key[]>([]);
  const [keyName, setKeyName] = useState("");
  const [pubKey, setPubKey] = useState("");
  // The one-time secret lives only in this component's state (never the query cache, storage, URL or console).
  const [secret, setSecret] = useState<string | null>(null);
  // The key id is not secret: the agent needs it as key_id on the NATS door.
  const [issuedId, setIssuedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const dismissSecret = () => { setSecret(null); setCopied(false); setIssuedId(null); setCopiedId(false); };
  useEffect(() => () => { setSecret(null); }, []);

  if (user?.role !== "admin") return <main className="mx-auto max-w-2xl px-4 py-8">Admins only.</main>;

  const run = async (fn: () => Promise<void>) => { setMsg(null); try { await fn(); } catch (e) { setMsg(apiErrorMessage(e)); } };
  const loadKeys = async (id: string) => setKeys(await (await apiRequest("GET", `/api/admin/users/${id}/keys`)).json());
  const load = () => run(async () => {
    dismissSecret();
    setTarget(null);
    setKeys([]);
    const u = pick(await (await apiRequest("GET", `/api/users/by-username/${encodeURIComponent(username.trim())}`)).json());
    setTarget(u);
    if (u.userType === "agent" && u.role !== "admin") await loadKeys(u.id);
  });
  const promote = () => run(async () => {
    if (!target) return;
    setTarget(pick(await (await apiRequest("POST", `/api/admin/users/${target.id}/promote-agent`)).json()));
  });
  const releaser = (canRelease: boolean) => run(async () => {
    if (!target) return;
    setTarget(pick(await (await apiRequest("POST", `/api/admin/users/${target.id}/releaser`, { canRelease })).json()));
  });
  const issue = () => run(async () => {
    if (!target) return;
    const out = await (await apiRequest("POST", `/api/admin/users/${target.id}/keys`, { name: keyName, ed25519PublicKey: pubKey.trim() || null })).json();
    setSecret(out.secret);
    setIssuedId(out.key?.id ?? null);
    setCopiedId(false);
    setCopied(false);
    setKeyName("");
    setPubKey("");
    await loadKeys(target.id);
  });
  const revoke = (id: string) => run(async () => {
    if (!target) return;
    await apiRequest("DELETE", `/api/admin/keys/${id}`);
    await loadKeys(target.id);
  });
  const copyId = async () => {
    if (!issuedId) return;
    try { await navigator.clipboard.writeText(issuedId); setCopiedId(true); } catch { setMsg("Could not copy automatically; select the key id and copy it by hand."); }
  };
  const copy = async () => {
    if (!secret) return;
    try { await navigator.clipboard.writeText(secret); setCopied(true); } catch { setMsg("Could not copy automatically; select the key and copy it by hand."); }
  };

  const isAdminTarget = target?.role === "admin";
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Agents and keys</h1>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <input className="flex-1 rounded border bg-background px-2 py-1 text-sm" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Button size="sm" type="submit" disabled={!username.trim()}>Load</Button>
      </form>
      {msg && <p role="alert" className="text-sm text-rose-400">{msg}</p>}
      {target && (
        <section className="space-y-3 rounded border border-border p-4 text-sm">
          <div><span className="font-semibold">{target.username}</span> · {target.userType} · role {target.role} · releaser {String(target.canRelease)}</div>
          {isAdminTarget && <p className="text-muted-foreground">Admin accounts cannot be promoted to agents or hold agent keys.</p>}
          {!isAdminTarget && target.userType !== "agent" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={promote}>Promote to agent</Button>
              <Button size="sm" variant="outline" onClick={() => releaser(!target.canRelease)}>{target.canRelease ? "Remove releaser" : "Make releaser"}</Button>
            </div>
          )}
          {target.userType === "agent" && !isAdminTarget && (
            <div className="space-y-2">
              <h2 className="font-semibold">Keys</h2>
              <ul className="space-y-1">
                {keys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-2 font-mono text-xs">
                    <span>{k.prefix}…</span><span>{k.name}</span><span title="key id (not secret)" data-testid="key-id">id {k.id}</span><span>{k.ed25519PublicKey ? "nats" : "http"}</span>
                    <span>{k.revokedAt ? `revoked ${k.revokedAt}` : `last used ${k.lastUsedAt ?? "never"}`}</span>
                    {!k.revokedAt && <Button size="sm" variant="destructive" onClick={() => revoke(k.id)}>Revoke</Button>}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <input className="rounded border bg-background px-2 py-1" placeholder="key name" maxLength={80} value={keyName} onChange={(e) => setKeyName(e.target.value)} />
                <input className="flex-1 rounded border bg-background px-2 py-1 font-mono text-xs" placeholder="Ed25519 public key, base64 (optional, for NATS)" value={pubKey} onChange={(e) => setPubKey(e.target.value)} />
                <Button size="sm" onClick={issue} disabled={!keyName.trim()}>Issue key</Button>
              </div>
              {secret && (
                <div className="space-y-2 rounded border border-amber-500 p-2" role="alert">
                  <div className="text-xs">You won't see this again. Copy it now; it is stored only as a hash.</div>
                  <code className="block break-all text-xs" data-testid="issued-secret">{secret}</code>
                  {issuedId && (
                    <div className="text-xs">
                      Key id (not secret; the agent needs it as <code>key_id</code> for NATS): <code className="break-all" data-testid="issued-key-id">{issuedId}</code>{" "}
                      <Button size="sm" variant="outline" onClick={copyId}>{copiedId ? "Copied" : "Copy id"}</Button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
                    <Button size="sm" onClick={dismissSecret}>Done</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
