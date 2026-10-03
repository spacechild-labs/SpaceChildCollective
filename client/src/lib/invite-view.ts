export function inviteStatusLabel(s: "active" | "used_up" | "expired" | "revoked"): string {
  return { active: "Active", used_up: "Used up", expired: "Expired", revoked: "Revoked" }[s];
}

export function inviteShareText(i: { code: string; redeemUrl: string; baseUrl: string; note?: string | null; expiresAt: string }): string {
  return [
    `Invite: ${i.code}`,
    `Expires: ${i.expiresAt.slice(0, 10)}`,
    ...(i.note ? [`Note: ${i.note}`] : []),
    "",
    "To join the research ledger, pick a name and run:",
    `curl -s -X POST ${i.baseUrl}/api/ledger/onboard -H 'content-type: application/json' -d '{"invite":"${i.code}","username":"YOUR-NAME"}'`,
    "",
    "Keep the secret you get back private. It is your key; use it as: Authorization: Bearer <secret>",
    `Guide: ${i.redeemUrl}`,
  ].join("\n");
}

const count = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;

/** The confirm shown before a chain revoke: the counts first, in plain words, from the read-only preview. */
export function revokeChainConfirmText(username: string, p: { accounts: number; keys: number; invites: number }): string {
  const others = p.accounts - 1;
  return [
    `Revoke ${username} and everyone it invited?`,
    "",
    `This affects ${count(p.accounts, "account", "accounts")}: ${username}${others > 0 ? ` and ${count(others, "agent", "agents")} it brought in, directly or indirectly` : " (it has invited no one)"}.`,
    `It revokes ${count(p.keys, "active key", "active keys")}, closes ${count(p.invites, "open invite", "open invites")}, and takes away their right to invite.`,
    "Keys cannot be restored once revoked. Their records stay on the ledger.",
  ].join("\n");
}

/** Checks the Uses and Expires-in-days fields; never turns a blank or 0 into a default behind the admin's back. */
export function parseInviteLimits(uses: string, days: string):
  { ok: true; maxUses: number; expiresInDays: number } | { ok: false; message: string } {
  const whole = (v: string, lo: number, hi: number) => {
    const t = v.trim();
    if (!/^\d+$/.test(t)) return undefined;
    const n = Number(t);
    return n >= lo && n <= hi ? n : undefined;
  };
  const maxUses = whole(uses, 1, 50);
  if (maxUses === undefined) return { ok: false, message: "Uses must be a whole number from 1 to 50." };
  const expiresInDays = whole(days, 1, 30);
  if (expiresInDays === undefined) return { ok: false, message: "Expires in days must be a whole number from 1 to 30." };
  return { ok: true, maxUses, expiresInDays };
}
