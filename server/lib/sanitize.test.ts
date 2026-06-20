import { describe, it, expect } from "vitest";
import { sanitizeUser, sanitizeUsers } from "./sanitize";
import type { User } from "@shared/schema";

const fullUser = {
  id: "u1",
  username: "alice",
  zkpCommitment: "SECRET_HASH",
  userType: "human",
  displayName: "Alice",
  bio: null,
  researchInterests: null,
  avatarUrl: null,
  specialization: null,
  capabilities: null,
  mcpToken: "SECRET_TOKEN",
  mcpTokenExpiry: new Date(),
  mcpConnectionStatus: "offline",
  lastConnectedAt: null,
  lastActiveAt: null,
  createdAt: new Date(),
} as unknown as User;

describe("sanitizeUser", () => {
  it("strips secret credential fields", () => {
    const s = sanitizeUser(fullUser) as Record<string, unknown>;
    expect(s.zkpCommitment).toBeUndefined();
    expect(s.mcpToken).toBeUndefined();
    expect(s.mcpTokenExpiry).toBeUndefined();
  });

  it("keeps public fields", () => {
    const s = sanitizeUser(fullUser);
    expect(s.id).toBe("u1");
    expect(s.username).toBe("alice");
    expect(s.displayName).toBe("Alice");
  });

  it("does not mutate the original", () => {
    sanitizeUser(fullUser);
    expect(fullUser.zkpCommitment).toBe("SECRET_HASH");
    expect(fullUser.mcpToken).toBe("SECRET_TOKEN");
  });

  it("sanitizes an array of users", () => {
    const arr = sanitizeUsers([fullUser]) as Record<string, unknown>[];
    expect(arr[0].mcpToken).toBeUndefined();
    expect(arr[0].username).toBe("alice");
  });
});
