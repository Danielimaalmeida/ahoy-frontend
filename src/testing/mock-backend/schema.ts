/**
 * A small JSON Schema checker for the requests the mock receives. The real API checks every parameter and body against
 * `openapi/ahoy-v1.yaml` with Ajv and answers `400 validation_failed` with one `errors` entry per difference; the mock
 * does the same against the same document (the JSON mirror `src/testing/fixtures/openapi.json`), with the subset of
 * keywords the contract's request schemas use and Ajv's wording. Ajv itself is a dev dependency of the specs only, so it
 * is neither in the mock's browser bundle nor needed by `npm run mock:api`; `schema.spec.ts` checks that both agree.
 */
import { isRecord, type FieldError } from "./http";

/** A schema of the contract. */
export type Schema = Readonly<Record<string, unknown>>;

/** Reads `#/components/...` references against the contract document. */
export class SchemaChecker {
  private readonly document: Readonly<Record<string, unknown>>;

  constructor(document: Readonly<Record<string, unknown>>) {
    this.document = document;
  }

  /** Follows a `$ref` (and refs to refs); anything else is returned as it is. */
  resolve(schema: unknown): unknown {
    let current = schema;
    for (let depth = 0; depth < 20 && isRecord(current) && typeof current["$ref"] === "string"; depth++) {
      const pointer = current["$ref"];
      if (!pointer.startsWith("#/")) throw new Error(`cannot follow ${pointer}`);
      let at: unknown = this.document;
      for (const part of pointer.slice(2).split("/")) at = isRecord(at) ? at[part] : undefined;
      if (at === undefined) throw new Error(`the contract has nothing at ${pointer}`);
      current = at;
    }
    return current;
  }

  /** Every difference between `value` and `schema`, with paths prefixed by `prefix` (`body`, `query.limit`...). */
  check(schema: unknown, value: unknown, prefix: string): FieldError[] {
    const errors: FieldError[] = [];
    this.walk(schema, value, "", (path, message) => errors.push({ path: `${prefix}${path}`, message }));
    return errors;
  }

  /** Whether `value` passes `schema`. */
  passes(schema: unknown, value: unknown): boolean {
    let ok = true;
    this.walk(schema, value, "", () => {
      ok = false;
    });
    return ok;
  }

  private walk(raw: unknown, value: unknown, path: string, report: (path: string, message: string) => void): void {
    const schema = this.resolve(raw);
    if (!isRecord(schema)) return;

    const oneOf = schema["oneOf"];
    if (Array.isArray(oneOf)) {
      const passing = oneOf.filter((branch) => this.passes(branch, value)).length;
      if (passing !== 1) report(path, "must match exactly one schema in oneOf");
    }

    const type = schema["type"];
    if (type !== undefined) {
      const types = Array.isArray(type) ? type : [type];
      if (!types.some((t) => typeof t === "string" && hasType(value, t))) {
        report(path, `must be ${types.join(",")}`);
        return;
      }
    }

    if ("const" in schema && !sameJson(schema["const"], value)) report(path, "must be equal to constant");
    const allowed = schema["enum"];
    if (Array.isArray(allowed) && !allowed.some((v) => sameJson(v, value)))
      report(path, "must be equal to one of the allowed values");

    if (typeof value === "string") this.checkString(schema, value, path, report);
    if (typeof value === "number") checkNumber(schema, value, path, report);
    if (Array.isArray(value)) this.checkArray(schema, value, path, report);
    if (isRecord(value)) this.checkObject(schema, value, path, report);
  }

  private checkString(schema: Schema, value: string, path: string, report: (p: string, m: string) => void): void {
    const length = [...value].length;
    const min = schema["minLength"];
    const max = schema["maxLength"];
    if (typeof min === "number" && length < min) report(path, `must NOT have fewer than ${min} characters`);
    if (typeof max === "number" && length > max) report(path, `must NOT have more than ${max} characters`);
    const pattern = schema["pattern"];
    if (typeof pattern === "string" && !new RegExp(pattern, "u").test(value))
      report(path, `must match pattern "${pattern}"`);
  }

  private checkArray(schema: Schema, value: readonly unknown[], path: string, report: (p: string, m: string) => void) {
    const min = schema["minItems"];
    const max = schema["maxItems"];
    if (typeof min === "number" && value.length < min) report(path, `must NOT have fewer than ${min} items`);
    if (typeof max === "number" && value.length > max) report(path, `must NOT have more than ${max} items`);
    if (schema["uniqueItems"] === true) {
      const seen = value.map((v) => JSON.stringify(v));
      if (new Set(seen).size !== seen.length) report(path, "must NOT have duplicate items");
    }
    const items = schema["items"];
    if (items !== undefined) value.forEach((item, i) => this.walk(items, item, `${path}/${i}`, report));
  }

  private checkObject(
    schema: Schema,
    value: Readonly<Record<string, unknown>>,
    path: string,
    report: (p: string, m: string) => void,
  ): void {
    const keys = Object.keys(value);
    const minProperties = schema["minProperties"];
    if (typeof minProperties === "number" && keys.length < minProperties)
      report(path, `must NOT have fewer than ${minProperties} properties`);
    const required = schema["required"];
    if (Array.isArray(required))
      for (const name of required)
        if (typeof name === "string" && !(name in value)) report(path, `must have required property '${name}'`);
    const properties = isRecord(schema["properties"]) ? schema["properties"] : {};
    if (schema["additionalProperties"] === false && keys.some((k) => !(k in properties)))
      report(path, "must NOT have additional properties");
    for (const key of keys)
      if (key in properties) this.walk(properties[key], value[key], `${path}/${escapePointer(key)}`, report);
  }
}

function checkNumber(schema: Schema, value: number, path: string, report: (p: string, m: string) => void): void {
  const minimum = schema["minimum"];
  const maximum = schema["maximum"];
  if (typeof minimum === "number" && value < minimum) report(path, `must be >= ${minimum}`);
  if (typeof maximum === "number" && value > maximum) report(path, `must be <= ${maximum}`);
}

/** Whether a JSON value has the JSON Schema `type`. */
function hasType(value: unknown, type: string): boolean {
  switch (type) {
    case "null":
      return value === null;
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "array":
      return Array.isArray(value);
    case "object":
      return isRecord(value);
    default:
      return false;
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function escapePointer(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

/**
 * Why a text a person sent could not be stored by Postgres (a NUL character, or an unpaired surrogate), or null. The real
 * API answers such a body with `400 validation_failed` at path `body`.
 */
export function unstorableText(value: unknown): string | null {
  if (typeof value === "string") {
    if (value.includes("\u0000")) return "contains a NUL character";
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))
      return "contains an unpaired surrogate";
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = unstorableText(item);
      if (problem) return problem;
    }
    return null;
  }
  if (isRecord(value)) return unstorableText(Object.values(value));
  return null;
}
