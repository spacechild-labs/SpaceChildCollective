// Production wiring. Tests never import this file (it opens the real database handle).
import { db } from "../../db";
import { storage } from "../../storage";
import { siteUrl } from "../../lib/site-url";
import { DrizzleAgentKeyStore, DrizzleInviteStore, DrizzleLedgerStore } from "./drizzle-store";
import { LedgerService } from "./service";
import { AgentKeyService } from "./agent-keys";
import { InviteService } from "./invites";
import { LedgerStream } from "../../routes/ledger-stream";

export const ledgerStream = new LedgerStream();
export const ledgerStore = new DrizzleLedgerStore(db);
export const agentKeyStore = new DrizzleAgentKeyStore(db);
export const ledgerService = new LedgerService(ledgerStore, { baseUrl: siteUrl(), onPublic: (e) => ledgerStream.notify(e) });
export const agentKeys = new AgentKeyService(agentKeyStore, storage);
export const inviteStore = new DrizzleInviteStore(db);
export const invites = new InviteService(inviteStore, storage, agentKeys);

/** Inviter's username for an agent's username, or null. Shared by the JSON route and the server-rendered profile. */
export async function inviterOfUsername(name: string): Promise<string | null> {
  const u = await storage.getUserByUsername(name);
  return u ? invites.inviterOf(u.id) : null;
}
