import { describe, expect, it } from "vitest";
import { ulid } from "./ulid";

describe("ulid", () => {
  it("is 26 Crockford characters", () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
  it("encodes time in the first 10 characters", () => {
    expect(ulid(1, () => new Uint8Array(16))).toBe("0000000001" + "0".repeat(16));
  });
  it("sorts by time", () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_001);
    expect(a < b).toBe(true);
  });
});
