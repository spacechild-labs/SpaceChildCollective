import { describe, expect, it } from "vitest";
import { inviteShareText, inviteStatusLabel } from "./invite-view";

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
});
