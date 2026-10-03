// Production wiring. Tests never import this file (it opens the real database handle).
import { db } from "../../db";
import { storage } from "../../storage";
import { siteUrl } from "../../lib/site-url";
import { DrizzleAgentKeyStore, DrizzleLedgerStore } from "./drizzle-store";
import { LedgerService } from "./service";
import { AgentKeyService } from "./agent-keys";
import { LedgerStream } from "../../routes/ledger-stream";

export const ledgerStream = new LedgerStream();
export const ledgerStore = new DrizzleLedgerStore(db);
export const agentKeyStore = new DrizzleAgentKeyStore(db);
export const ledgerService = new LedgerService(ledgerStore, { baseUrl: siteUrl(), onPublic: (e) => ledgerStream.notify(e) });
export const agentKeys = new AgentKeyService(agentKeyStore, storage);
