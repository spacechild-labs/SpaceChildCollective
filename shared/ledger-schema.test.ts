import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getTableColumns, getTableName } from "drizzle-orm";
import {
  CAMPAIGN_ID_RE, LEDGER_KINDS, LEDGER_STANDINGS, REVIEW_VERDICTS,
  agentKeys, ledgerCampaigns, ledgerOutbox, ledgerRecords, ledgerReleases,
} from "./ledger-schema";
import { users } from "./schema";

describe("ledger schema", () => {
  it("names the tables as the spec does", () => {
    expect([ledgerCampaigns, ledgerRecords, ledgerReleases, ledgerOutbox, agentKeys].map(getTableName))
      .toEqual(["ledger_campaigns", "ledger_records", "ledger_releases", "ledger_outbox", "agent_keys"]);
  });

  it("has every record column the hash and the spec need", () => {
    const cols = Object.values(getTableColumns(ledgerRecords)).map((c) => c.name).sort();
    expect(cols).toEqual([
      "about_id", "amends_id", "author_id", "body", "campaign_id", "client_ref", "content_hash", "corrects_id",
      "created_at", "evidence", "filed_via", "held", "id", "kind", "reviews_id", "sets_status", "standing", "title", "verdict",
    ]);
  });

  it("stores only a hash of agent keys", () => {
    const cols = Object.values(getTableColumns(agentKeys)).map((c) => c.name);
    expect(cols).toContain("key_hash");
    expect(cols).not.toContain("secret");
    expect(cols).not.toContain("key");
  });

  it("adds can_release to users", () => {
    expect(Object.values(getTableColumns(users)).map((c) => c.name)).toContain("can_release");
  });

  it("fixes the vocabularies", () => {
    expect(LEDGER_KINDS).toEqual(["preregistration", "amendment", "run", "result", "failure", "certificate", "correction", "review", "decision", "note"]);
    expect(LEDGER_STANDINGS).toEqual(["certified", "measured", "unverified", "retracted"]);
    expect(REVIEW_VERDICTS).toEqual(["holds", "breaks", "inconclusive"]);
    expect(CAMPAIGN_ID_RE.test("ecdsa-c005")).toBe(true);
    expect(CAMPAIGN_ID_RE.test("A-bad")).toBe(false);
    expect(CAMPAIGN_ID_RE.test("ab")).toBe(false);
  });

  it("is pushed by drizzle-kit and loaded by the db handle", () => {
    expect(readFileSync(new URL("../drizzle.config.ts", import.meta.url), "utf8")).toContain("./shared/ledger-schema.ts");
    expect(readFileSync(new URL("../server/db.ts", import.meta.url), "utf8")).toContain("@shared/ledger-schema");
  });
});
