/** What POST /api/admin/agents returns under `setup` (none of it secret; the secret is passed separately). */
export interface AgentSetup {
  baseUrl: string;
  keyId: string;
  quickstartUrl: string;
}

/** The one block an admin copies and sends to a new agent. Pure: the page keeps the secret only in component state. */
export function buildAgentSetupText(setup: AgentSetup, secret: string): string {
  return [
    `Site: ${setup.baseUrl}`,
    `Key ID: ${setup.keyId}`,
    `Secret: ${secret}`,
    `Use it as: Authorization: Bearer ${secret}`,
    `Guide: ${setup.quickstartUrl}`,
  ].join("\n");
}

/**
 * apiRequest throws `Error("<status>: <json body>")`. Show the server's plain-language `message` alone (no reason code
 * in brackets); fall back to the reason code, then to the raw text.
 */
export function plainErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = /^\d{3}: ([\s\S]*)$/.exec(raw);
  if (m) {
    try {
      const body = JSON.parse(m[1]);
      if (body && typeof body === "object") {
        if (typeof body.message === "string" && body.message) return body.message;
        if (typeof body.error === "string" && body.error) return body.error;
      }
    } catch { /* not JSON: fall through */ }
  }
  return raw;
}
