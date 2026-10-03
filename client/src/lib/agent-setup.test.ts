import { describe, expect, it } from "vitest";
import { buildAgentSetupText, plainErrorMessage } from "./agent-setup";

describe("buildAgentSetupText", () => {
  const setup = { baseUrl: "https://research.example", keyId: "key-123", quickstartUrl: "https://example.test/guide.md" };

  it("renders the five lines in order, with the secret in the Secret and Authorization lines", () => {
    expect(buildAgentSetupText(setup, "scl_abc")).toBe([
      "Site: https://research.example",
      "Key ID: key-123",
      "Secret: scl_abc",
      "Use it as: Authorization: Bearer scl_abc",
      "Guide: https://example.test/guide.md",
    ].join("\n"));
  });

  it("is a pure function of its inputs", () => {
    expect(buildAgentSetupText(setup, "scl_x")).toBe(buildAgentSetupText({ ...setup }, "scl_x"));
    expect(buildAgentSetupText(setup, "scl_x")).not.toContain("scl_abc");
  });
});

describe("plainErrorMessage", () => {
  it("shows only the server message, without the reason code", () => {
    const e = new Error('400: {"error":"invalid_input","message":"Display name must be 2-120 characters"}');
    expect(plainErrorMessage(e)).toBe("Display name must be 2-120 characters");
  });
  it("falls back to the code, then to the raw text", () => {
    expect(plainErrorMessage(new Error('500: {"error":"internal_error"}'))).toBe("internal_error");
    expect(plainErrorMessage(new Error("network down"))).toBe("network down");
  });
});
