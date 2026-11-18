import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const read = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));
const ajv = () => addFormats(new Ajv2020({ allErrors: true, strict: false }));

describe("question bank", () => {
  const validate = ajv().compile(read("questions/schema.json"));
  const files = readdirSync(join(root, "questions")).filter((f) => f.endsWith(".json") && f !== "schema.json");

  it("has the general set and at least one role pack", () => {
    expect(files).toContain("general.json");
    expect(files.some((f) => f.startsWith("pack-"))).toBe(true);
  });

  it.each(files)("%s matches the schema", (f) => {
    const ok = validate(read(`questions/${f}`));
    expect(validate.errors, JSON.stringify(validate.errors)).toBeNull();
    expect(ok).toBe(true);
  });

  it("includes the GTM and revenue ops pack, with its own set id", () => {
    expect(files).toContain("pack-gtm-revops.json");
    expect(read("questions/pack-gtm-revops.json").set_id).toBe("gtm-revops");
  });

  it("uses the self_assessment type and never gives it a behavioral situation", () => {
    const all = files.flatMap((f) => read(`questions/${f}`).questions as { type: string; behavioral_situation: string | null }[]);
    const own = all.filter((q) => q.type === "self_assessment");
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((q) => q.behavioral_situation === null)).toBe(true);
  });

  it("never reuses a question id across files", () => {
    const ids = files.flatMap((f) => read(`questions/${f}`).questions.map((q: { id: string }) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("prompt schemas", () => {
  const schemaFiles = readdirSync(join(root, "prompts/schemas")).filter((f) => f.endsWith(".schema.json"));

  it("has a schema for each of the twelve prompts (12 is the Smart coach)", () => {
    expect(schemaFiles.length).toBe(12);
  });

  it.each(schemaFiles)("%s is a valid JSON Schema", (f) => {
    expect(() => ajv().compile(read(`prompts/schemas/${f}`))).not.toThrow();
  });
});

// `examples/expected/*.score.json` hold partial assertions (only listed fields are checked), so they are not
// validated as whole outputs. What must hold: every answer has an expected file, every criterion named exists in
// the score schema, and every verdict is a real one.
describe("score fixtures", () => {
  const scoreSchema = read("prompts/schemas/score-answer.schema.json");
  const criteria: string[] = scoreSchema.properties.criteria.required;
  const answers = readdirSync(join(root, "prompts/examples/answers")).map((f) => f.replace(".json", ""));

  it.each(answers)("%s has an expected score file", (name) => {
    expect(existsSync(join(root, `prompts/examples/expected/${name}.score.json`))).toBe(true);
  });

  it.each(answers)("%s only asserts known criteria with pass, fail or na", (name) => {
    const asserted = read(`prompts/examples/expected/${name}.score.json`).assert.criteria as Record<string, string>;
    for (const [criterion, verdict] of Object.entries(asserted)) {
      expect(criteria, criterion).toContain(criterion);
      expect(["pass", "fail", "na"], `${criterion}=${verdict}`).toContain(verdict);
    }
  });

  it("the example question is a valid question type", () => {
    const q = read("prompts/examples/question.json");
    const types = ["behavioral", "tell_me_about_yourself", "technical", "factual", "future_looking", "gap", "motivation", "self_assessment"];
    expect(types).toContain(q.classification.type);
  });
});

describe("rubric version 2 fixtures", () => {
  const fx = read("prompts/examples/rubric2/score.json");
  const criteria = Object.keys(read("prompts/schemas/score-answer.schema.json").properties.criteria.properties);
  const types: string[] = read("prompts/schemas/classify-question.schema.json").properties.type.enum;

  it("names real criteria and real verdicts, and sends no pitch", () => {
    expect(fx.rubric_version).toBe(2);
    for (const [name, c] of Object.entries(fx.cases) as [string, { target_pitch: string; classification: { type: string }; assert: { criteria: Record<string, string> } }][]) {
      expect(c.target_pitch, name).toBe("");
      expect(types, name).toContain(c.classification.type);
      for (const [k, v] of Object.entries(c.assert.criteria)) {
        expect(criteria, `${name} ${k}`).toContain(k);
        expect(["pass", "fail", "na"]).toContain(v);
      }
    }
  });

  it("has a self_assessment case, a gap answered yes with proof, and the classify cases use real types", () => {
    expect(fx.cases.self_assessment_weakness.classification.type).toBe("self_assessment");
    expect(fx.cases.gap_yes_with_proof.assert.criteria.type_fit).toBe("pass");
    for (const c of Object.values(fx.classify_cases) as { expected: { type: string } }[]) expect(types).toContain(c.expected.type);
  });
});
