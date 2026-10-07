/**
 * The Ahoy API contract as tests see it: `openapi.json` (the YAML, parsed by `scripts/openapi-mirror.mjs`) and an Ajv that
 * checks a value against one of its schemas. Used by `contract.spec.ts` (lane 2A) and, for the conformance tests of the
 * mock backend, by lane 2D: write no second one.
 *
 * Ajv draft 2020-12 with `strict: false` (the contract has OpenAPI-only keywords such as `x-sse-data-schema`) and
 * `allErrors`, so a failure lists every difference. `ajv-formats` is not an approved dependency, so `date-time`, the only
 * format the contract uses, is registered here.
 */
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import mirror from "./openapi.json";

/** A schema object of the contract (a JSON Schema in OpenAPI 3.1 dress). */
export type ContractSchema = Readonly<Record<string, unknown>>;

/** One operation of the contract, as `paths` lists it. */
export interface ContractOperation {
  readonly operationId: string;
  readonly method: string;
  /** The path as the contract writes it, such as `/stories/{key}/stop`. */
  readonly path: string;
  /** The schema of the JSON request body, or null when the operation has none. */
  readonly requestSchema: ContractSchema | null;
  /** The schema of the JSON body of the successful answer, or null when it is not JSON (events stream, artifact text). */
  readonly successSchema: ContractSchema | null;
  /** The media types the successful answer may have, such as `application/json` or `text/markdown`. */
  readonly successMediaTypes: readonly string[];
  /** The status codes of the successful answers (2xx and 304), as text. */
  readonly successStatuses: readonly string[];
}

const HTTP_METHODS = ["get", "put", "post", "delete", "patch"] as const;
const BASE = "ahoy";

/** Whether a value is a JSON object (not null, not an array). */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The part of the document this helper reads, checked once at load. */
interface ContractDocument {
  readonly paths: Readonly<Record<string, unknown>>;
  readonly components: Readonly<Record<string, unknown>> & { readonly schemas: Readonly<Record<string, unknown>> };
}

/** Whether the mirror has the `paths` and `components.schemas` this helper reads. */
function isContractDocument(value: unknown): value is ContractDocument {
  return (
    isRecord(value) &&
    isRecord(value["paths"]) &&
    isRecord(value["components"]) &&
    isRecord(value["components"]["schemas"])
  );
}

const document: unknown = mirror;
if (!isContractDocument(document))
  throw new Error("openapi.json has no `paths` and `components.schemas`: run `npm run api:types`");
const contract: ContractDocument = document;

/** Whether a string is an RFC 3339 `date-time` with a real calendar date and a real time of day. */
export function isDateTime(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(text);
  if (!m) return false;
  const part = (i: number): number => Number(m[i] ?? 0); // the regex guarantees digits; the offset groups are empty for `Z`
  const [year, month, day, hour, minute, second] = [part(1), part(2), part(3), part(4), part(5), part(6)];
  const offsetHour = part(7);
  const offsetMinute = part(8);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return (
    daysInMonth !== undefined &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 60 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addFormat("date-time", { type: "string", validate: isDateTime });
ajv.addSchema({ $id: BASE, components: contract.components });

/** Points every `#/components/...` reference at the registered document, so a schema can be compiled on its own. */
function rebase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rebase);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      key === "$ref" && typeof inner === "string" && inner.startsWith("#/components/")
        ? `${BASE}${inner}`
        : rebase(inner),
    ]),
  );
}

/** A schema ready for `ajv.compile`: `rebase` of an object is an object. */
function standalone(schema: ContractSchema): ContractSchema {
  const rebased = rebase(schema);
  if (!isRecord(rebased)) throw new Error("a schema must stay an object");
  return rebased;
}

const compiled = new Map<string, ValidateFunction>();

/** Returns what is wrong with `value` against `schema`, one line per difference; an empty list means it conforms. */
export function violations(schema: ContractSchema, value: unknown): readonly string[] {
  const key = JSON.stringify(schema);
  let validate = compiled.get(key);
  if (!validate) {
    validate = ajv.compile(standalone(schema));
    compiled.set(key, validate);
  }
  if (validate(value)) return [];
  return (validate.errors ?? []).map((e) => {
    const extra = e.keyword === "additionalProperties" ? ` (${String(e.params["additionalProperty"])})` : "";
    return `${e.instancePath || "/"} ${e.message ?? "is invalid"}${extra}`;
  });
}

/** The schema `components.schemas[name]`; throws when the contract has none, so a typo in a test fails loudly. */
export function schemaNamed(name: string): ContractSchema {
  const schema = contract.components.schemas[name];
  if (!isRecord(schema)) throw new Error(`the contract has no schema named ${name}`);
  return schema;
}

/** Follows a `{ $ref: "#/components/..." }` to what it points at; anything else is returned as it is. */
function resolve(value: unknown): unknown {
  if (!isRecord(value) || typeof value["$ref"] !== "string") return value;
  const pointer = value["$ref"];
  if (!pointer.startsWith("#/")) throw new Error(`cannot follow ${pointer}`);
  let at: unknown = contract;
  for (const part of pointer.slice(2).split("/")) at = isRecord(at) ? at[part] : undefined;
  if (at === undefined) throw new Error(`the contract has nothing at ${pointer}`);
  return at;
}

/** The schema of the `application/json` content of a request body or a response, or null when there is none. */
function jsonSchemaOf(holder: unknown): ContractSchema | null {
  const resolved = resolve(holder);
  const content = isRecord(resolved) ? resolved["content"] : undefined;
  const json = isRecord(content) ? content["application/json"] : undefined;
  const schema = isRecord(json) ? json["schema"] : undefined;
  return isRecord(schema) ? schema : null;
}

/** The media types of the `content` of a request body or a response. */
function mediaTypesOf(holder: unknown): readonly string[] {
  const resolved = resolve(holder);
  const content = isRecord(resolved) ? resolved["content"] : undefined;
  return isRecord(content) ? Object.keys(content) : [];
}

/** Every operation of the contract, in the order `paths` lists them. */
export function operations(): readonly ContractOperation[] {
  const found: ContractOperation[] = [];
  for (const [path, item] of Object.entries(contract.paths)) {
    if (!isRecord(item)) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isRecord(op) || typeof op["operationId"] !== "string") continue;
      const responses = isRecord(op["responses"]) ? op["responses"] : {};
      const successStatuses = Object.keys(responses).filter((status) => /^2\d\d$|^304$/.test(status));
      const first = successStatuses.find((status) => status !== "304");
      found.push({
        operationId: op["operationId"],
        method: method.toUpperCase(),
        path,
        requestSchema: jsonSchemaOf(op["requestBody"]),
        successSchema: first === undefined ? null : jsonSchemaOf(responses[first]),
        successMediaTypes: first === undefined ? [] : mediaTypesOf(responses[first]),
        successStatuses,
      });
    }
  }
  return found;
}

/** One operation of the contract by its `operationId`; throws when there is none. */
export function operationNamed(operationId: string): ContractOperation {
  const op = operations().find((o) => o.operationId === operationId);
  if (!op) throw new Error(`the contract has no operation named ${operationId}`);
  return op;
}

/** What is wrong with `body` as the JSON body of a request to `operationId`; empty when it conforms. */
export function requestViolations(operationId: string, body: unknown): readonly string[] {
  const { requestSchema } = operationNamed(operationId);
  if (!requestSchema) throw new Error(`${operationId} takes no JSON request body`);
  return violations(requestSchema, body);
}

/** What is wrong with `body` as the JSON body of the successful answer of `operationId`; empty when it conforms. */
export function responseViolations(operationId: string, body: unknown): readonly string[] {
  const { successSchema } = operationNamed(operationId);
  if (!successSchema) throw new Error(`${operationId} has no JSON successful answer`);
  return violations(successSchema, body);
}

/**
 * The string values of an enum in the contract, in its order: `components.schemas[name]` itself, or its property
 * `property` (such as `SlotModel.lens`, whose `null` is left out). Throws when there is no such enum.
 */
export function enumOf(name: string, property?: string): readonly string[] {
  let schema: unknown = schemaNamed(name);
  if (property !== undefined) {
    const properties = isRecord(schema) ? schema["properties"] : undefined;
    schema = resolve(isRecord(properties) ? properties[property] : undefined);
  }
  const values = isRecord(schema) ? schema["enum"] : undefined;
  const strings = Array.isArray(values) ? values.filter((v): v is string => v !== null) : [];
  if (strings.length === 0 || !strings.every((v) => typeof v === "string"))
    throw new Error(`the contract has no string enum at ${name}${property === undefined ? "" : `.${property}`}`);
  return strings;
}
