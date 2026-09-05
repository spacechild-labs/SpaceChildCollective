import { createHash } from "crypto";

/**
 * Canonical JSON: keys sorted recursively, no whitespace, undefined dropped,
 * Dates as ISO strings. Two semantically equal documents hash identically no
 * matter which code path produced them. Used for preregistration hashes and
 * finding content hashes.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : normalize(v)));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = normalize((value as Record<string, unknown>)[key]);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashCanonical(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

/** The fields of a study design that are frozen by preregistration. */
export const PREREGISTERED_DESIGN_FIELDS = [
  "name",
  "paradigm",
  "constructs",
  "primaryQuestion",
  "secondaryQuestions",
  "hypotheses",
  "participants",
  "variables",
  "designType",
  "conditions",
  "analysisPlan",
  "powerAnalysis",
  "blindingLevel",
  "controlMechanisms",
] as const;

export function preregistrationHash(design: Record<string, unknown>): string {
  const frozen: Record<string, unknown> = {};
  for (const f of PREREGISTERED_DESIGN_FIELDS) frozen[f] = design[f];
  return hashCanonical(frozen);
}

/** Content hash of a finding: what the claim is and what backs it. */
export function findingContentHash(finding: { title: string; claim: string; evidence: unknown }): string {
  return hashCanonical({ title: finding.title, claim: finding.claim, evidence: finding.evidence });
}
