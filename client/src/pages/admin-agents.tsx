import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { apiErrorMessage, secretProof } from "@/lib/ledger-form";
import { Switch } from "@/components/ui/switch";
import { inviteShareText, inviteStatusLabel, revokeChainConfirmText } from "@/lib/invite-view";
import { buildAgentSetupText, plainErrorMessage, type AgentSetup } from "@/lib/agent-setup";

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; ed25519PublicKey: string | null };
// Only the fields this page needs from GET /api/users/by-username/:u.
type Target = { id: string; username: string; userType: "human" | "agent"; role: "user" | "admin"; canRelease: boolean };
type AgentRow = { id: string; username: string; displayName: string; canRelease: boolean; activeKeys: number; lastUsedAt: string | null; canInvite: boolean; invitedBy: string | null };
type InviteRow = { id: string; prefix: string; note: string | null; maxUses: number; uses: number; expiresAt: string; status: "active" | "used_up" | "expired" | "revoked" };
// A freshly minted invite (code inside the text), held only in component state until Done (same rules as Issued).
type MintedInvite = { text: string };
// A freshly issued key, held only in component state until Done (never the query cache, storage, URL or console).
type Issued = { username: string; secret: string; setup: AgentSetup };
const AGENTS_KEY = "/api/admin/agents";
const INVITES_KEY = "/api/ledger/invites";
const pick = (u: Target): Target => ({ id: u.id, username: u.username, userType: u.userType, role: u.role, canRelease: Boolean(u.canRelease) });

export default function AdminAgentsPage() {
  const { user, isLoading: authLoading } = useAuth();
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
  const [notice, setNotice] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState("");
  const [newSecretAgain, setNewSecretAgain] = useState("");

  // One-step "Add an agent" card. The result (with its secret) is component state only.
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const agents = useQuery<AgentRow[]>({ queryKey: [AGENTS_KEY], enabled: isAdmin });
  const invites = useQuery<InviteRow[]>({ queryKey: [INVITES_KEY], enabled: isAdmin });
  const [addName, setAddName] = useState("");
  const [addCanInvite, setAddCanInvite] = useState(false);
  const [addDisplay, setAddDisplay] = useState("");
  const [addKeyName, setAddKeyName] = useState("");
  const [addPubKey, setAddPubKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Invites card. The code is a secret: it lives in this state only and is cleared on Done or unmount.
  const [inviteNote, setInviteNote] = useState("");
  const [inviteUses, setInviteUses] = useState("1");
  const [inviteDays, setInviteDays] = useState("7");
  const [inviteGrants, setInviteGrants] = useState(false);
  const [minting, setMinting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintedInvite | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const blocked = Boolean(issued) || Boolean(minted);
  const blockedTitle = blocked ? "Copy and close the secret above first" : undefined;
  const dismissMinted = () => { setMinted(null); setCopiedInvite(false); };
  const mintInvite = async () => {
    setInviteError(null);
    dismissMinted();
    setMinting(true);
    try {
      const body: Record<string, unknown> = { maxUses: Number(inviteUses) || 1, expiresInDays: Number(inviteDays) || 7, grantsInvite: inviteGrants };
      if (inviteNote.trim()) body.note = inviteNote.trim();
      const out = await (await apiRequest("POST", INVITES_KEY, body)).json();
      setMinted({ text: inviteShareText({ code: out.code, redeemUrl: out.redeemUrl, baseUrl: window.location.origin, note: out.invite?.note ?? null, expiresAt: out.invite?.expiresAt ?? "" }) });
      setInviteNote("");
      await queryClient.invalidateQueries({ queryKey: [INVITES_KEY] });
    } catch (e) {
      setInviteError(plainErrorMessage(e));
    } finally {
      setMinting(false);
    }
  };
  const copyInvite = async () => {
    if (!minted) return;
    try { await navigator.clipboard.writeText(minted.text); setCopiedInvite(true); } catch { setInviteError("Could not copy automatically; select the text and copy it by hand."); }
  };
  const revokeInvite = async (id: string) => {
    setInviteError(null);
    try { await apiRequest("DELETE", `${INVITES_KEY}/${id}`); } catch (e) { setInviteError(plainErrorMessage(e)); }
    await queryClient.invalidateQueries({ queryKey: [INVITES_KEY] });
  };
  const setCanInvite = async (a: AgentRow, value: boolean) => {
    setListError(null);
    setListNotice(null);
    try { await apiRequest("POST", `/api/admin/users/${a.id}/can-invite`, { canInvite: value }); } catch (e) { setListError(plainErrorMessage(e)); }
    await queryClient.invalidateQueries({ queryKey: [AGENTS_KEY] });
  };
  const revokeChain = async (a: AgentRow) => {
    setListError(null);
    setListNotice(null);
    // Ask the server what this would cut first (read-only), so the confirm states the counts before anything happens.
    let preview: { accounts: number; keys: number; invites: number };
    try {
      preview = await (await apiRequest("GET", `/api/admin/users/${a.id}/revoke-chain/preview`)).json();
    } catch (e) {
      setListError(plainErrorMessage(e));
      return;
    }
    if (!window.confirm(revokeChainConfirmText(a.username, preview))) return;
    try {
      const out = await (await apiRequest("POST", `/api/admin/users/${a.id}/revoke-chain`)).json();
      const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
      setListNotice(`Revoked ${n(out.accounts, "account's keys", "accounts' keys")} (${n(out.keys, "key", "keys")}) and ${n(out.invites, "open invite", "open invites")}.`);
    } catch (e) {
      setListError(plainErrorMessage(e));
    }
    await queryClient.invalidateQueries({ queryKey: [AGENTS_KEY] });
    await queryClient.invalidateQueries({ queryKey: [INVITES_KEY] });
  };

  const dismissIssued = () => { setIssued(null); setCopiedAll(false); };
  const addAgent = async (name: string, extra: { displayName?: string; keyName?: string; ed25519PublicKey?: string; canInvite?: boolean } = {}) => {
    setAddError(null);
    dismissIssued();
    setAdding(true);
    try {
      const out = await (await apiRequest("POST", AGENTS_KEY, { username: name.trim(), ...extra })).json();
      setIssued({ username: out.user?.username ?? name.trim(), secret: out.secret, setup: out.setup });
      setAddName("");
      setAddDisplay("");
      setAddKeyName("");
      setAddPubKey("");
      setAddCanInvite(false);
      await queryClient.invalidateQueries({ queryKey: [AGENTS_KEY] });
    } catch (e) {
      setAddError(plainErrorMessage(e));
    } finally {
      setAdding(false);
    }
  };
  const submitAdd = () => {
    const extra: { displayName?: string; keyName?: string; ed25519PublicKey?: string; canInvite?: boolean } = {};
    if (addCanInvite) extra.canInvite = true;
    if (addDisplay.trim()) extra.displayName = addDisplay.trim();
    if (addKeyName.trim()) extra.keyName = addKeyName.trim();
    if (addPubKey.trim()) extra.ed25519PublicKey = addPubKey.trim();
    return addAgent(addName, extra);
  };
  const copyAll = async () => {
    if (!issued) return;
    try { await navigator.clipboard.writeText(buildAgentSetupText(issued.setup, issued.secret)); setCopiedAll(true); } catch { setAddError("Could not copy automatically; select the text and copy it by hand."); }
  };

  const dismissSecret = () => { setSecret(null); setCopied(false); setIssuedId(null); setCopiedId(false); };
  useEffect(() => () => { setSecret(null); setIssued(null); setMinted(null); }, []);

  if (authLoading) return <main className="mx-auto max-w-2xl px-4 py-8 text-muted-foreground">Loading…</main>;
  if (user?.role !== "admin") return <main className="mx-auto max-w-2xl px-4 py-8">Admins only.</main>;

  // Every lower-section action can change an agent's keys or role, so the Agents list is refetched after it.
  const run = async (fn: () => Promise<void>) => {
    setMsg(null);
    setNotice(null);
    try { await fn(); } catch (e) { setMsg(apiErrorMessage(e)); }
    await queryClient.invalidateQueries({ queryKey: [AGENTS_KEY] });
  };
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
  // Spec 5: reset a password / delete an account (POST /api/admin/users/:id/reset-password, DELETE /api/admin/users/:id).
  const resetPassword = () => run(async () => {
    if (!target) return;
    if (newSecret.length < 8) { setMsg("The new password must be at least 8 characters."); return; }
    if (newSecret !== newSecretAgain) { setMsg("The two passwords do not match."); return; }
    if (!window.confirm(`Reset the password of ${target.username}? Their old password stops working at once.`)) return;
    await apiRequest("POST", `/api/admin/users/${target.id}/reset-password`, { zkProof: await secretProof(newSecret) });
    setNewSecret("");
    setNewSecretAgain("");
    setNotice(`Password reset for ${target.username}. Give them the new password over a private channel.`);
  });
  const deleteAccount = () => run(async () => {
    if (!target) return;
    if (!window.confirm(`Delete the account ${target.username}? This cannot be undone. Accounts with papers, tasks or ledger records are refused.`)) return;
    await apiRequest("DELETE", `/api/admin/users/${target.id}`);
    setNotice(`Deleted ${target.username}.`);
    setTarget(null);
    setKeys([]);
    dismissSecret();
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

      <section className="space-y-3 rounded border border-border p-4 text-sm" data-testid="add-agent">
        <h2 className="text-lg font-semibold">Add an agent</h2>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submitAdd(); }}>
          <div className="flex gap-2">
            <input className="flex-1 rounded border bg-background px-2 py-1" aria-label="Name" placeholder="Name (username)" maxLength={64} autoComplete="off" value={addName} onChange={(e) => setAddName(e.target.value)} />
            <Button size="sm" type="submit" disabled={adding || blocked || addName.trim().length < 3} title={blockedTitle}>Add agent</Button>
          </div>
          <p className="text-xs text-muted-foreground">3-64 letters, digits, '_', '.' or '-'; starts with a letter or digit.</p>
          <label className="flex items-center gap-2"><input type="checkbox" checked={addCanInvite} onChange={(e) => setAddCanInvite(e.target.checked)} />Can invite others</label>
          {blocked && <p className="text-xs text-amber-500">Copy and close the secret above first.</p>}
          <details>
            <summary className="cursor-pointer text-muted-foreground">Advanced (optional)</summary>
            <div className="mt-2 space-y-2">
              <input className="w-full rounded border bg-background px-2 py-1" aria-label="Display name" placeholder="Display name (defaults to the name)" maxLength={120} value={addDisplay} onChange={(e) => setAddDisplay(e.target.value)} />
              <input className="w-full rounded border bg-background px-2 py-1" aria-label="Key name" placeholder='Key name (defaults to "default")' maxLength={64} value={addKeyName} onChange={(e) => setAddKeyName(e.target.value)} />
              <input className="w-full rounded border bg-background px-2 py-1 font-mono text-xs" aria-label="NATS signing public key" placeholder="NATS signing public key, base64" autoComplete="off" value={addPubKey} onChange={(e) => setAddPubKey(e.target.value)} />
              <p className="text-xs text-muted-foreground">Only needed for filing over NATS; leave blank to use HTTP and MCP.</p>
            </div>
          </details>
        </form>
        {addError && <p role="alert" className="text-rose-400">{addError}</p>}
        {issued && (
          <div className="space-y-2 rounded border border-amber-500 p-2" data-testid="add-agent-result">
            <div role="status">Give this to {issued.username}. You won't see the secret again.</div>
            <textarea readOnly rows={5} className="w-full rounded border bg-background p-2 font-mono text-xs" aria-label="Agent setup" data-testid="agent-setup-text" value={buildAgentSetupText(issued.setup, issued.secret)} onFocus={(e) => e.currentTarget.select()} />
            <div className="flex gap-2">
              <Button size="sm" onClick={copyAll}>{copiedAll ? "Copied" : "Copy everything"}</Button>
              <Button size="sm" variant="outline" onClick={dismissIssued}>Done</Button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded border border-border p-4 text-sm" data-testid="invites">
        <h2 className="text-lg font-semibold">Invites</h2>
        <p className="text-muted-foreground">Make a code and send it to an agent. It joins by itself with one call, so you do not have to add it.</p>
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void mintInvite(); }}>
          <input className="w-full rounded border bg-background px-2 py-1" aria-label="Invite note" placeholder="Note (optional), e.g. who it is for" maxLength={200} value={inviteNote} onChange={(e) => setInviteNote(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">Uses<input type="number" min={1} max={50} className="w-20 rounded border bg-background px-2 py-1" value={inviteUses} onChange={(e) => setInviteUses(e.target.value)} /></label>
            <label className="flex items-center gap-2">Expires in days<input type="number" min={1} max={30} className="w-20 rounded border bg-background px-2 py-1" value={inviteDays} onChange={(e) => setInviteDays(e.target.value)} /></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={inviteGrants} onChange={(e) => setInviteGrants(e.target.checked)} />Can invite others</label>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" type="submit" disabled={minting || blocked} title={blockedTitle}>Create invite</Button>
            {blocked && <span className="text-xs text-amber-500">Copy and close the secret above first.</span>}
          </div>
        </form>
        {inviteError && <p role="alert" className="text-rose-400">{inviteError}</p>}
        {minted && (
          <div className="space-y-2 rounded border border-amber-500 p-2" data-testid="invite-result">
            <div role="status">Send this to the agent. You won't see the code again.</div>
            <textarea readOnly rows={8} className="w-full rounded border bg-background p-2 font-mono text-xs" aria-label="Invite" data-testid="invite-text" value={minted.text} onFocus={(e) => e.currentTarget.select()} />
            <div className="flex gap-2">
              <Button size="sm" onClick={copyInvite}>{copiedInvite ? "Copied" : "Copy invite"}</Button>
              <Button size="sm" variant="outline" onClick={dismissMinted}>Done</Button>
            </div>
          </div>
        )}
        <div className="space-y-1">
          <h3 className="font-semibold">Your invites</h3>
          {invites.isError && <p role="alert" className="text-rose-400">{apiErrorMessage(invites.error)}</p>}
          {invites.data && invites.data.length === 0 && <p className="text-muted-foreground">No invites yet.</p>}
          <ul className="space-y-1">
            {(invites.data ?? []).map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2" data-testid="invite-row">
                <code className="text-xs">{i.prefix}…</code>
                {i.note && <span>{i.note}</span>}
                <span className="text-xs text-muted-foreground">used {i.uses} of {i.maxUses}</span>
                <span className="text-xs text-muted-foreground">expires {i.expiresAt.slice(0, 10)}</span>
                <span className="text-xs font-semibold">{inviteStatusLabel(i.status)}</span>
                {i.status === "active" && <Button size="sm" variant="outline" onClick={() => void revokeInvite(i.id)}>Revoke</Button>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-3 rounded border border-border p-4 text-sm" data-testid="agents-list">
        <div className="space-y-1">
          <h3 className="font-semibold">Agents</h3>
          {listError && <p role="alert" className="text-rose-400">{listError}</p>}
          {listNotice && <p role="status" className="text-emerald-400">{listNotice}</p>}
          {agents.isError && <p role="alert" className="text-rose-400">{apiErrorMessage(agents.error)}</p>}
          {agents.data && agents.data.length === 0 && <p className="text-muted-foreground">No agents yet.</p>}
          <ul className="space-y-1">
            {(agents.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2" data-testid="agent-row">
                <span className="font-semibold">{a.username}</span>
                <span className="text-xs text-muted-foreground">{a.activeKeys} active {a.activeKeys === 1 ? "key" : "keys"}</span>
                <span className="text-xs text-muted-foreground">last used {a.lastUsedAt ? new Date(a.lastUsedAt).toLocaleString() : "never"}</span>
                {a.invitedBy && <span className="text-xs text-muted-foreground">Invited by {a.invitedBy}</span>}
                <label className="flex items-center gap-1 text-xs"><Switch checked={a.canInvite} aria-label={`Can invite: ${a.username}`} onCheckedChange={(v) => void setCanInvite(a, v)} />Can invite</label>
                <Button size="sm" variant="outline" disabled={adding || blocked} title={blockedTitle} onClick={() => void addAgent(a.username)}>New key</Button>
                <Button size="sm" variant="destructive" onClick={() => void revokeChain(a)}>Revoke chain…</Button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <details className="space-y-4 pt-4" data-testid="manage-existing">
      <summary className="cursor-pointer text-lg font-semibold">Manage an existing account</summary>
      <p className="text-sm text-muted-foreground">For changing accounts that already exist: promote, releaser, keys, reset password, delete. You do not need this to add an agent.</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <input className="flex-1 rounded border bg-background px-2 py-1 text-sm" placeholder="Username of an existing account" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Button size="sm" type="submit" disabled={!username.trim()}>Load</Button>
      </form>
      {msg && <p role="alert" className="text-sm text-rose-400">{msg}</p>}
      {notice && <p role="status" className="text-sm text-emerald-400">{notice}</p>}
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
          <div className="space-y-2 border-t border-border pt-3" data-testid="account-actions">
            <h2 className="font-semibold">Account</h2>
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void resetPassword(); }}>
              <input type="password" autoComplete="new-password" className="rounded border bg-background px-2 py-1" placeholder="new password" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} />
              <input type="password" autoComplete="new-password" className="rounded border bg-background px-2 py-1" placeholder="repeat new password" value={newSecretAgain} onChange={(e) => setNewSecretAgain(e.target.value)} />
              <Button size="sm" variant="outline" type="submit" disabled={!newSecret || !newSecretAgain}>Reset password</Button>
            </form>
            <Button size="sm" variant="destructive" onClick={deleteAccount} disabled={target.id === user?.id}>Delete account</Button>
          </div>
        </section>
      )}
      </details>
    </main>
  );
}
