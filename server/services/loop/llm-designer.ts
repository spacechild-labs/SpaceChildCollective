import OpenAI from "openai";
import type { StudyDesign, StudyParadigm, ConsciousnessConstruct } from "../ai-study-designer";

/**
 * LLM refinement for study designs.
 *
 * The heuristic designer (ai-study-designer.ts) always produces a structurally
 * complete design. When an OpenAI-compatible key is configured, this module asks
 * the model for the parts heuristics do badly — the actual research question,
 * falsifiable hypotheses, named variables and conditions, expected outcomes and
 * limitations — as strict JSON, validates it, and merges it onto the base design.
 * Without a key (or on any model failure) the base design is returned unchanged
 * and the caller records generator = "heuristic".
 */

const PARADIGMS: StudyParadigm[] = [
  "hypothesis_testing", "bayesian_updating", "exploratory_mapping", "phenomenological", "network_analysis",
  "longitudinal_tracking", "multi_method", "integrated_information", "predictive_processing", "enactive",
  "global_workspace", "higher_order",
];
const CONSTRUCTS: ConsciousnessConstruct[] = [
  "awareness", "attention", "metacognition", "self_model", "agency", "temporal_binding", "integration",
  "differentiation", "reportability", "affect", "intentionality", "qualia", "resonance", "coherence", "emergence",
];

export interface LlmRefinement {
  name?: string;
  description?: string;
  paradigm?: StudyParadigm;
  constructs?: ConsciousnessConstruct[];
  primaryQuestion?: string;
  secondaryQuestions?: string[];
  exploratoryQuestions?: string[];
  hypotheses?: { type: string; statement: string; rationale: string }[];
  variables?: { name: string; role: string; type: string; operationalization: string }[];
  conditions?: { name: string; description: string; isControl: boolean }[];
  expectedOutcomes?: string[];
  limitations?: string[];
  ethicalConsiderations?: string[];
  theoreticalFramework?: string;
}

export interface LlmDesignerOptions {
  /** Prior findings/feedback that this study is a follow-up to. */
  context?: string[];
  model?: string;
}

export function llmConfigured(): boolean {
  return Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
}

function client(): OpenAI {
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  });
}

const HYPOTHESIS_TYPES = new Set(["directional", "non_directional", "equivalence", "superiority", "bayesian_prior"]);
const VARIABLE_ROLES = new Set(["independent", "dependent", "mediator", "moderator", "covariate", "latent"]);
const VARIABLE_TYPES = new Set(["continuous", "categorical", "ordinal", "binary", "count"]);

function strArray(v: unknown, max = 12): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((s) => typeof s === "string" && s.trim().length > 0).map((s) => s.trim().slice(0, 600));
  return out.length ? out.slice(0, max) : undefined;
}

/** Validate an untrusted model payload into a safe refinement (drops anything malformed). */
export function validateRefinement(raw: unknown): LlmRefinement {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: LlmRefinement = {};
  if (typeof r.name === "string" && r.name.trim()) out.name = r.name.trim().slice(0, 200);
  if (typeof r.description === "string" && r.description.trim()) out.description = r.description.trim().slice(0, 2000);
  if (typeof r.paradigm === "string" && (PARADIGMS as string[]).includes(r.paradigm)) out.paradigm = r.paradigm as StudyParadigm;
  const constructs = strArray(r.constructs)?.filter((c) => (CONSTRUCTS as string[]).includes(c)) as ConsciousnessConstruct[] | undefined;
  if (constructs?.length) out.constructs = constructs;
  if (typeof r.primaryQuestion === "string" && r.primaryQuestion.trim()) out.primaryQuestion = r.primaryQuestion.trim().slice(0, 600);
  out.secondaryQuestions = strArray(r.secondaryQuestions);
  out.exploratoryQuestions = strArray(r.exploratoryQuestions);
  if (Array.isArray(r.hypotheses)) {
    const hs = r.hypotheses
      .filter((h) => h && typeof h === "object" && typeof (h as any).statement === "string")
      .map((h: any) => ({
        type: HYPOTHESIS_TYPES.has(h.type) ? h.type : "directional",
        statement: String(h.statement).trim().slice(0, 600),
        rationale: typeof h.rationale === "string" ? h.rationale.trim().slice(0, 600) : "",
      }))
      .filter((h) => h.statement.length > 0);
    if (hs.length) out.hypotheses = hs.slice(0, 8);
  }
  if (Array.isArray(r.variables)) {
    const vs = r.variables
      .filter((v) => v && typeof v === "object" && typeof (v as any).name === "string")
      .map((v: any) => ({
        name: String(v.name).trim().slice(0, 120),
        role: VARIABLE_ROLES.has(v.role) ? v.role : "dependent",
        type: VARIABLE_TYPES.has(v.type) ? v.type : "continuous",
        operationalization: typeof v.operationalization === "string" ? v.operationalization.trim().slice(0, 600) : "",
      }))
      .filter((v) => v.name.length > 0);
    if (vs.length) out.variables = vs.slice(0, 12);
  }
  if (Array.isArray(r.conditions)) {
    const cs = r.conditions
      .filter((c) => c && typeof c === "object" && typeof (c as any).name === "string")
      .map((c: any) => ({
        name: String(c.name).trim().slice(0, 120),
        description: typeof c.description === "string" ? c.description.trim().slice(0, 600) : "",
        isControl: Boolean(c.isControl),
      }))
      .filter((c) => c.name.length > 0);
    if (cs.length) out.conditions = cs.slice(0, 8);
  }
  out.expectedOutcomes = strArray(r.expectedOutcomes);
  out.limitations = strArray(r.limitations);
  out.ethicalConsiderations = strArray(r.ethicalConsiderations);
  if (typeof r.theoreticalFramework === "string" && r.theoreticalFramework.trim()) out.theoreticalFramework = r.theoreticalFramework.trim().slice(0, 600);
  // Drop undefined keys so the merge below is a clean overlay.
  for (const k of Object.keys(out) as (keyof LlmRefinement)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** Overlay a validated refinement onto a base design, preserving ids and structure. */
export function mergeRefinement(base: StudyDesign, ref: LlmRefinement): StudyDesign {
  const merged: StudyDesign = { ...base };
  if (ref.name) merged.name = ref.name;
  if (ref.description) merged.description = ref.description;
  if (ref.paradigm) merged.paradigm = ref.paradigm;
  if (ref.constructs) merged.constructs = ref.constructs;
  if (ref.primaryQuestion) merged.primaryQuestion = ref.primaryQuestion;
  if (ref.secondaryQuestions) merged.secondaryQuestions = ref.secondaryQuestions;
  if (ref.exploratoryQuestions) merged.exploratoryQuestions = ref.exploratoryQuestions;
  if (ref.hypotheses) {
    merged.hypotheses = ref.hypotheses.map((h, i) => ({
      id: base.hypotheses?.[i]?.id ?? `h${i + 1}`,
      type: h.type as any,
      statement: h.statement,
      rationale: h.rationale,
      priorBelief: base.hypotheses?.[i]?.priorBelief,
    }));
  }
  if (ref.variables) {
    merged.variables = ref.variables.map((v, i) => ({
      id: base.variables[i]?.id ?? `v${i + 1}`,
      name: v.name,
      role: v.role as any,
      type: v.type as any,
      operationalization: v.operationalization || base.variables[i]?.operationalization || "",
      measurementApproach: base.variables[i]?.measurementApproach ?? "computational",
      reliability: base.variables[i]?.reliability,
      validity: base.variables[i]?.validity,
    }));
  }
  if (ref.conditions) {
    merged.conditions = ref.conditions.map((c, i) => ({
      id: base.conditions[i]?.id ?? `c${i + 1}`,
      name: c.name,
      description: c.description,
      isControl: c.isControl,
    }));
  }
  if (ref.expectedOutcomes) merged.expectedOutcomes = ref.expectedOutcomes;
  if (ref.limitations) merged.limitations = ref.limitations;
  if (ref.ethicalConsiderations) merged.ethicalConsiderations = ref.ethicalConsiderations;
  if (ref.theoreticalFramework) merged.theoreticalFramework = ref.theoreticalFramework;
  return merged;
}

function buildPrompt(base: StudyDesign, prompt: string, context: string[]): string {
  return [
    "You are a consciousness-research methodologist. Refine the study design below for the researcher's request.",
    "Return ONLY a JSON object with any of these keys (omit keys you would not change):",
    `name, description, paradigm (one of ${PARADIGMS.join("|")}), constructs (subset of ${CONSTRUCTS.join("|")}),`,
    "primaryQuestion, secondaryQuestions[], exploratoryQuestions[],",
    "hypotheses[{type: directional|non_directional|equivalence|superiority|bayesian_prior, statement, rationale}],",
    "variables[{name, role: independent|dependent|mediator|moderator|covariate|latent, type: continuous|categorical|ordinal|binary|count, operationalization}],",
    "conditions[{name, description, isControl}], expectedOutcomes[], limitations[], ethicalConsiderations[], theoreticalFramework.",
    "Hypotheses must be falsifiable with the named variables. Be concrete and honest about limits; the participants are AI agents unless the request says otherwise.",
    "",
    `Researcher request: ${prompt}`,
    context.length ? `\nPrior findings / feedback this study follows up on:\n- ${context.join("\n- ")}` : "",
    "",
    "Current heuristic design (JSON):",
    JSON.stringify({
      name: base.name,
      paradigm: base.paradigm,
      constructs: base.constructs,
      primaryQuestion: base.primaryQuestion,
      hypotheses: base.hypotheses,
      variables: base.variables.map((v) => ({ name: v.name, role: v.role, type: v.type, operationalization: v.operationalization })),
      conditions: base.conditions,
      designType: base.designType,
      participants: base.participants,
    }),
  ].join("\n");
}

/**
 * Ask the model to refine a base design. Returns { design, used } where `used`
 * is false when no key is configured or the model call failed/was unusable.
 */
export async function llmRefineDesign(
  base: StudyDesign,
  prompt: string,
  opts: LlmDesignerOptions = {},
): Promise<{ design: StudyDesign; used: boolean; error?: string }> {
  if (!llmConfigured()) return { design: base, used: false };
  const primary = opts.model || process.env.AI_STUDY_MODEL || "gpt-5";
  const fallback = process.env.AI_STUDY_FALLBACK_MODEL || "gpt-5-mini";
  const messages = [
    { role: "system" as const, content: "You design rigorous, preregistrable studies. Output strict JSON only." },
    { role: "user" as const, content: buildPrompt(base, prompt, opts.context ?? []) },
  ];

  // Reasoning models spend completion tokens on hidden reasoning first; with a
  // small cap and JSON mode the visible message comes back EMPTY (seen on Replit's
  // OpenAI integration with gpt-5 at 4096). Low effort + a generous cap, and one
  // retry on a different model if the first answer is unusable.
  const attempt = async (model: string): Promise<{ refinement?: LlmRefinement; error?: string }> => {
    try {
      const params: Record<string, unknown> = {
        model,
        messages,
        response_format: { type: "json_object" },
        max_completion_tokens: Number(process.env.AI_STUDY_MAX_TOKENS ?? 16_000),
      };
      if (/^(gpt-5|o\d)/i.test(model)) params.reasoning_effort = process.env.AI_STUDY_REASONING_EFFORT || "low";
      const completion = await client().chat.completions.create(params as any);
      const choice = completion.choices[0];
      const text = choice?.message?.content?.trim();
      if (!text) return { error: `empty model response (finish_reason=${choice?.finish_reason ?? "unknown"})` };
      const refinement = validateRefinement(JSON.parse(text));
      if (Object.keys(refinement).length === 0) return { error: "model returned nothing usable" };
      return { refinement };
    } catch (err: any) {
      return { error: String(err?.message ?? err) };
    }
  };

  const first = await attempt(primary);
  if (first.refinement) return { design: mergeRefinement(base, first.refinement), used: true };
  console.warn(`[llm-designer] refinement failed (${primary}): ${first.error}`);
  if (fallback && fallback !== primary) {
    const second = await attempt(fallback);
    if (second.refinement) return { design: mergeRefinement(base, second.refinement), used: true };
    console.warn(`[llm-designer] fallback failed (${fallback}): ${second.error}`);
    return { design: base, used: false, error: `${primary}: ${first.error}; ${fallback}: ${second.error}` };
  }
  return { design: base, used: false, error: first.error };
}
