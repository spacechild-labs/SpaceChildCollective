/**
 * Boot-time environment validation.
 *
 * Fail fast with a clear, actionable message instead of crashing deep inside a
 * request handler or — worse — silently running with insecure default secrets.
 */

const KNOWN_WEAK_SECRETS = new Set([
  "spacechild-research-collective-secret",
  "spacechild-dev-secret-local",
  "spacechild-mcp-secret",
  "change-me",
  "secret",
  "dev-only-insecure-secret",
  "change-me-32+-random-chars",
  "encryption-key",
  "default-encryption-key",
]);

export function validateEnv(): void {
  const isProd = process.env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required.");
  }

  // Secrets that must exist and be strong in production.
  for (const key of ["SESSION_SECRET", "MCP_TOKEN_SECRET", "ENCRYPTION_KEY"]) {
    const val = process.env[key];
    if (!val) {
      if (isProd) errors.push(`${key} is required in production.`);
      else warnings.push(`${key} is not set — using an insecure development default.`);
      continue;
    }
    if (isProd && (val.length < 32 || KNOWN_WEAK_SECRETS.has(val))) {
      errors.push(
        `${key} is weak or a known default; use a unique random value of at least 32 characters in production.`,
      );
    }
  }

  // Optional feature flags / keys — warn only, the feature degrades gracefully.
  const optionalFeatures: Array<[string, string]> = [
    ["AI_INTEGRATIONS_OPENAI_API_KEY", "OpenAI-powered agent features"],
    ["PARALLEL_API_KEY", "Parallel AI web research"],
  ];
  for (const [key, feature] of optionalFeatures) {
    if (!process.env[key]) warnings.push(`${key} is not set — ${feature} will be unavailable.`);
  }

  for (const w of warnings) console.warn(`[env] WARNING: ${w}`);
  if (errors.length) {
    console.error("[env] Invalid environment configuration:");
    for (const e of errors) console.error(`  - ${e}`);
    throw new Error("Environment validation failed. See messages above and .env.example.");
  }
}
