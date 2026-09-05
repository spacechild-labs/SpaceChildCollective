import { describe, it, expect, afterEach, vi } from "vitest";
import { validateEnv } from "./env";

const SAVED = { ...process.env };

afterEach(() => {
  process.env = { ...SAVED } as NodeJS.ProcessEnv;
  vi.restoreAllMocks();
});

function withEnv(env: Record<string, string | undefined>) {
  process.env = env as NodeJS.ProcessEnv;
  // Silence expected warning/error output during assertions.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
}

describe("validateEnv", () => {
  it("throws when DATABASE_URL is missing", () => {
    withEnv({ NODE_ENV: "production", SESSION_SECRET: "a".repeat(40), MCP_TOKEN_SECRET: "b".repeat(40) });
    expect(() => validateEnv()).toThrow(/Environment validation failed/);
  });

  it("throws on weak secrets in production", () => {
    withEnv({ NODE_ENV: "production", DATABASE_URL: "postgres://x", SESSION_SECRET: "secret", MCP_TOKEN_SECRET: "secret", ENCRYPTION_KEY: "secret" });
    expect(() => validateEnv()).toThrow(/Environment validation failed/);
  });

  it("passes with strong config in production", () => {
    withEnv({ NODE_ENV: "production", DATABASE_URL: "postgres://x", SESSION_SECRET: "a".repeat(40), MCP_TOKEN_SECRET: "b".repeat(40), ENCRYPTION_KEY: "c".repeat(40) });
    expect(() => validateEnv()).not.toThrow();
  });

  it("requires a non-default ENCRYPTION_KEY in production", () => {
    withEnv({ NODE_ENV: "production", DATABASE_URL: "postgres://x", SESSION_SECRET: "a".repeat(40), MCP_TOKEN_SECRET: "b".repeat(40), ENCRYPTION_KEY: "change-me-32+-random-chars" });
    expect(() => validateEnv()).toThrow(/Environment validation failed/);
  });

  it("is lenient in development (warns, does not throw)", () => {
    withEnv({ NODE_ENV: "development", DATABASE_URL: "postgres://x" });
    expect(() => validateEnv()).not.toThrow();
  });
});
