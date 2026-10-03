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
