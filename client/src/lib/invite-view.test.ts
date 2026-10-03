import { describe, expect, it } from "vitest";
import { inviteShareText, inviteStatusLabel, parseInviteLimits, revokeChainConfirmText } from "./invite-view";

describe("invite view helpers", () => {
  it("labels statuses in plain words", () => {
    expect(inviteStatusLabel("active")).toBe("Active");
    expect(inviteStatusLabel("used_up")).toBe("Used up");
    expect(inviteStatusLabel("expired")).toBe("Expired");
    expect(inviteStatusLabel("revoked")).toBe("Revoked");
  });
  it("builds the text an agent needs to onboard itself, including the one curl call", () => {
    const t = inviteShareText({ code: "sci_TESTCODE", redeemUrl: "https://example.org/ledger/agent-guide#invite", baseUrl: "https://example.org", note: "for kannaka", expiresAt: "2026-10-10T00:00:00.000Z" });
    expect(t).toContain("Invite: sci_TESTCODE");
    expect(t).toContain("Expires: 2026-10-10");
    expect(t).toContain("curl -s -X POST https://example.org/api/ledger/onboard");
    expect(t).toContain('"invite":"sci_TESTCODE"');
    expect(t).toContain("https://example.org/ledger/agent-guide#invite");
    expect(t).toContain("Keep the secret you get back private");
  });
  it("omits the note line when there is no note", () => {
    const t = inviteShareText({ code: "sci_X", redeemUrl: "u", baseUrl: "b", expiresAt: "2026-10-10T00:00:00.000Z" });
    expect(t).not.toContain("Note:");
  });
  it("states the revoke-chain counts before the admin confirms", () => {
    const t = revokeChainConfirmText("0xSCADA-QE", { accounts: 37, keys: 40, invites: 3 });
    expect(t).toContain("Revoke 0xSCADA-QE and everyone it invited?");
    expect(t).toContain("This affects 37 accounts: 0xSCADA-QE and 36 agents it brought in");
    expect(t).toContain("It revokes 40 active keys, closes 3 open invites");
    const one = revokeChainConfirmText("solo", { accounts: 1, keys: 1, invites: 0 });
    expect(one).toContain("This affects 1 account: solo (it has invited no one).");
    expect(one).toContain("It revokes 1 active key, closes 0 open invites");
  });
  it("validates invite uses (1-50) and expiry (1-30) instead of coercing blanks and zeros", () => {
    expect(parseInviteLimits("1", "7")).toEqual({ ok: true, maxUses: 1, expiresInDays: 7 });
    expect(parseInviteLimits(" 50 ", "30")).toEqual({ ok: true, maxUses: 50, expiresInDays: 30 });
    for (const bad of ["", "0", "51", "1.5", "-1", "abc"]) {
      expect(parseInviteLimits(bad, "7")).toEqual({ ok: false, message: "Uses must be a whole number from 1 to 50." });
    }
    for (const bad of ["", "0", "31", "2.5"]) {
      expect(parseInviteLimits("1", bad)).toEqual({ ok: false, message: "Expires in days must be a whole number from 1 to 30." });
    }
  });
});
