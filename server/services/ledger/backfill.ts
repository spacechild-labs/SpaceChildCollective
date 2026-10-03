import { z } from "zod";
import { campaignInputSchema, recordInputSchema } from "@shared/ledger-validate";

export const REF_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LINKS = [["correctsRef", "correctsId"], ["reviewsRef", "reviewsId"], ["amendsRef", "amendsId"], ["aboutRef", "aboutId"]] as const;
const PLACEHOLDER_ID = "01J9Z3K8Q2A7B5C4D6E8F0G1H2";

const manifestRecord = z.object({
  ref: z.string().regex(REF_RE),
  correctsRef: z.string().optional(),
  reviewsRef: z.string().optional(),
  amendsRef: z.string().optional(),
  aboutRef: z.string().optional(),
  record: z.record(z.unknown()),
}).strict();

export const manifestSchema = z.object({
  campaigns: z.array(z.unknown()).default([]),
  records: z.array(manifestRecord),
}).strict();
export type BackfillManifest = z.infer<typeof manifestSchema>;

export interface BackfillClient {
  createCampaign(c: unknown): Promise<"created" | "exists">;
  file(r: Record<string, unknown>): Promise<{ id: string; created: boolean }>;
}

const describeIssues = (issues: z.ZodIssue[]) => issues.map((x) => `${x.path.join(".")} ${x.message}`.trim()).join("; ");

/** Local mirror of the server's checks: anything the server would reject for shape, urls or link rules fails here first. */
export function validateManifest(raw: unknown): { ok: true; manifest: BackfillManifest } | { ok: false; errors: string[] } {
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const m = parsed.data;
  const errors: string[] = [];
  m.campaigns.forEach((c, i) => {
    const r = campaignInputSchema.safeParse(c);
    if (!r.success) errors.push(`campaign ${i}: ${describeIssues(r.error.issues)}`);
  });
  const seen = new Set<string>();
  for (const entry of m.records) {
    if (seen.has(entry.ref)) errors.push(`duplicate ref "${entry.ref}"`);
    for (const [refKey, idKey] of LINKS) {
      const target = entry[refKey];
      if (target !== undefined && !seen.has(target)) errors.push(`record "${entry.ref}": ${refKey} "${target}" is not an earlier ref`);
      if (idKey in entry.record) errors.push(`record "${entry.ref}": set links with *Ref, not ${idKey}`);
    }
    if ("clientRef" in entry.record) errors.push(`record "${entry.ref}": clientRef is set by the runner`);
    // Validate the record as it will be sent, with a placeholder id where a ref will be resolved.
    const candidate: Record<string, unknown> = { ...entry.record };
    for (const [refKey, idKey] of LINKS) if (entry[refKey] !== undefined) candidate[idKey] = PLACEHOLDER_ID;
    const r = recordInputSchema.safeParse(candidate);
    if (!r.success) errors.push(`record "${entry.ref}": ${describeIssues(r.error.issues)}`);
    seen.add(entry.ref);
  }
  return errors.length ? { ok: false, errors } : { ok: true, manifest: m };
}

export async function runBackfill(m: BackfillManifest, client: BackfillClient, log: (line: string) => void = () => {}): Promise<Map<string, string>> {
  for (const c of m.campaigns) log(`campaign ${(c as { id: string }).id}: ${await client.createCampaign(c)}`);
  const ids = new Map<string, string>();
  for (const entry of m.records) {
    const body: Record<string, unknown> = { ...entry.record, clientRef: `backfill:${entry.ref}` };
    for (const [refKey, idKey] of LINKS) {
      const target = entry[refKey];
      if (target === undefined) continue;
      const id = ids.get(target);
      if (!id) throw new Error(`record "${entry.ref}": ${refKey} "${target}" was not filed earlier`);
      body[idKey] = id;
    }
    const { id, created } = await client.file(body);
    ids.set(entry.ref, id);
    log(`${created ? "filed " : "exists"} ${entry.ref} -> ${id}`);
  }
  return ids;
}
