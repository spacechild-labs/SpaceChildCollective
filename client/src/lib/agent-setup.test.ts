import { describe, expect, it } from "vitest";
import { buildAgentSetupText } from "./agent-setup";

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
