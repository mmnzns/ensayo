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

  it("never reuses a question id across files", () => {
    const ids = files.flatMap((f) => read(`questions/${f}`).questions.map((q: { id: string }) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("prompt schemas", () => {
  const schemaFiles = readdirSync(join(root, "prompts/schemas")).filter((f) => f.endsWith(".schema.json"));

  it("has a schema for each of the eleven prompts", () => {
    expect(schemaFiles.length).toBe(11);
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
    const types = ["behavioral", "tell_me_about_yourself", "technical", "factual", "future_looking", "gap", "motivation"];
    expect(types).toContain(q.classification.type);
  });
});
