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
