// Production wiring. Tests never import this file (it opens the real database handle).
import { db } from "../../db";
import { storage } from "../../storage";
import { siteUrl } from "../../lib/site-url";
import { DrizzleAgentKeyStore, DrizzleInviteStore, DrizzleLedgerStore } from "./drizzle-store";
import { LedgerService } from "./service";
import { AgentKeyService } from "./agent-keys";
import { InviteService } from "./invites";
import { LedgerStream } from "../../routes/ledger-stream";
import { DrizzleVerificationStore, VerificationService } from "./verifications";
import { makeEvidenceFetcher } from "./verify-fetch";
import { MAX_LIST_LIMIT } from "./types";

export const ledgerStream = new LedgerStream();
export const ledgerStore = new DrizzleLedgerStore(db);
export const agentKeyStore = new DrizzleAgentKeyStore(db);
// Derived verification tiers (shared/ledger-verify.ts). LEDGER_VERIFY=0 turns them off: records then carry no tier.
let verifier: VerificationService | undefined;
export const ledgerService = new LedgerService(ledgerStore, {
  baseUrl: siteUrl(),
  onPublic: (e) => { ledgerStream.notify(e); verifier?.onPublic(e.id); },
});
if (process.env.LEDGER_VERIFY !== "0" && process.env.NODE_ENV !== "test") {
  verifier = new VerificationService(new DrizzleVerificationStore(db), ledgerService, makeEvidenceFetcher());
  ledgerService.setVerifier(verifier);
  // Listing every public record queues those without a fresh tier; checks then run one at a time in the background.
  const sweep = async () => {
    let before: string | undefined;
    for (;;) {
      const page = await ledgerService.listRecords(null, { before, limit: MAX_LIST_LIMIT });
      if (page.length < MAX_LIST_LIMIT) break;
      before = page[page.length - 1].createdAt;
    }
  };
  const run = () => { sweep().catch((err) => console.error("[ledger-verify] sweep failed:", err)); };
  setTimeout(run, 60_000).unref();
  setInterval(run, 6 * 3_600_000).unref();
}
export const ledgerVerifier = verifier;
export const agentKeys = new AgentKeyService(agentKeyStore, storage);
export const inviteStore = new DrizzleInviteStore(db);
export const invites = new InviteService(inviteStore, storage, agentKeys);

/** Inviter's username for an agent's username, or null. Shared by the JSON route and the server-rendered profile. */
export async function inviterOfUsername(name: string): Promise<string | null> {
  const u = await storage.getUserByUsername(name);
  return u ? invites.inviterOf(u.id) : null;
}
