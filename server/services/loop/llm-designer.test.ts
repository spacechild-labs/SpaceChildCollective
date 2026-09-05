import { describe, it, expect } from "vitest";
import { validateRefinement, mergeRefinement } from "./llm-designer";
import type { StudyDesign } from "../ai-study-designer";

const base = {
  id: "d",
  name: "Base",
  description: "base",
  paradigm: "exploratory_mapping",
  constructs: ["awareness"],
  primaryQuestion: "Q?",
  secondaryQuestions: [],
  exploratoryQuestions: [],
  hypotheses: [{ id: "h1", type: "directional", statement: "old", rationale: "r", priorBelief: 0.4 }],
  participants: { type: "ai_agent", count: 3, selectionCriteria: [], exclusionCriteria: [], assignmentMethod: "random" },
  variables: [{ id: "v1", name: "old var", role: "dependent", type: "continuous", operationalization: "op", measurementApproach: "computational" }],
  designType: "between_subjects",
  conditions: [{ id: "c1", name: "ctrl", description: "", isControl: true }],
  phases: [],
  analysisPlan: { primary: [], secondary: [], exploratory: [], sensitivityAnalyses: [] },
  ethicalConsiderations: [],
  controlMechanisms: [],
  blindingLevel: "none",
  preregistration: false,
  theoreticalFramework: "tf",
  literatureContext: [],
  expectedOutcomes: [],
  limitations: [],
  createdAt: "t",
  generatedBy: "ai",
} as unknown as StudyDesign;

describe("validateRefinement", () => {
  it("keeps only well-typed fields and known enum values", () => {
    const r = validateRefinement({
      name: "  Better name ",
      paradigm: "not_a_paradigm",
      constructs: ["metacognition", "bogus"],
      hypotheses: [{ type: "weird", statement: "H1 holds", rationale: 5 }, { statement: "" }, "junk"],
      variables: [{ name: "Φ", role: "nope", type: "continuous" }],
      conditions: [{ name: "treated", isControl: "yes" }],
      limitations: ["a", 3, ""],
      extra: "ignored",
    });
    expect(r.name).toBe("Better name");
    expect(r.paradigm).toBeUndefined();
    expect(r.constructs).toEqual(["metacognition"]);
    expect(r.hypotheses).toEqual([{ type: "directional", statement: "H1 holds", rationale: "" }]);
    expect(r.variables).toEqual([{ name: "Φ", role: "dependent", type: "continuous", operationalization: "" }]);
    expect(r.conditions).toEqual([{ name: "treated", description: "", isControl: true }]);
    expect(r.limitations).toEqual(["a"]);
    expect("extra" in r).toBe(false);
  });

  it("returns an empty object for garbage", () => {
    expect(validateRefinement(null)).toEqual({});
    expect(validateRefinement("x")).toEqual({});
    expect(validateRefinement({ hypotheses: [] })).toEqual({});
  });
});

describe("mergeRefinement", () => {
  it("overlays refined fields, preserves ids and untouched structure", () => {
    const merged = mergeRefinement(base, validateRefinement({
      primaryQuestion: "Do agents share phase?",
      hypotheses: [{ type: "equivalence", statement: "new", rationale: "because" }, { statement: "second" }],
      variables: [{ name: "phase coherence", role: "dependent", type: "continuous", operationalization: "" }],
    }));
    expect(merged.primaryQuestion).toBe("Do agents share phase?");
    expect(merged.hypotheses?.[0]).toMatchObject({ id: "h1", type: "equivalence", statement: "new", priorBelief: 0.4 });
    expect(merged.hypotheses?.[1].id).toBe("h2");
    expect(merged.variables[0]).toMatchObject({ id: "v1", name: "phase coherence", operationalization: "op", measurementApproach: "computational" });
    expect(merged.conditions).toBe(base.conditions);
    expect(merged.analysisPlan).toBe(base.analysisPlan);
    expect(merged.name).toBe("Base");
  });
});
