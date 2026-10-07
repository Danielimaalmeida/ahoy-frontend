# Fixtures

Answers of the Ahoy API (`openapi/ahoy-v1.yaml`, 1.0.0-poc), written by hand for tests. **All data is fictional**, taken from the
wireframes: PROJ-123 in plan review (round 2 of 4), PROJ-131 with open questions, PROJ-140 running, alex@example.com and friends.
Never put real story content here (CLAUDE.md).

| File                                                                                | Operation(s)                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<operationId>.json` (`getHealth`, `listStories`, `getStory`, `listStoryRuns`, ...) | The body of the successful answer of that operation.                                                                                                                                                                                                                                                       |
| `startStory.json`, `stopStory.json`, `resumeStory.json`, `setStoryBudget.json`      | A `Story` each: the 201 or 202 answer of that command.                                                                                                                                                                                                                                                     |
| `setStoryModels.json`                                                               | The `ModelPlan` after the change.                                                                                                                                                                                                                                                                          |
| `getArtifactContent.json`                                                           | `{ path, mediaType, etag, text }`: the text the API sends (a raw body, not JSON), and the headers a client reads. The `etag` is the quoted sha256 that `listArtifacts.json` lists for the same file.                                                                                                       |
| `problems.json`                                                                     | One `application/problem+json` body per problem code (15), in the shape the real API sends.                                                                                                                                                                                                                |
| `mutate.ts`                                                                         | `withField` and `withoutField`, to break a fixture one field at a time in a test.                                                                                                                                                                                                                          |
| `openapi.json`                                                                      | The contract (`openapi/ahoy-v1.yaml`) parsed to JSON by `scripts/openapi-mirror.mjs`, because a spec can import JSON but cannot read the YAML. **Generated: never edit it.** `npm run api:types` writes it, `npm run api:check` fails when it differs from the YAML.                                       |
| `contract.ts`                                                                       | The Ajv helper: `violations(schema, value)`, `responseViolations(operationId, body)`, `requestViolations(operationId, body)`, `operations()`, `enumOf(...)`. Draft 2020-12, `strict: false`, `date-time` registered by hand. Lane 2D reuses it for the conformance tests of the mock: write no second one. |

Rules:

- Import them with the alias, for example `import story from "@testing/fixtures/getStory.json"`. JSON imports work in specs.
- Keep each one valid against the contract. `src/app/core/api/contract.spec.ts` checks every one against the success schema of
  its operation (and every entry of `problems.json` against `Problem`) with Ajv, and the guards of `core/api` accept them too
  (`guards.spec.ts`). `getArtifactContent.json` is the exception: the contract answers raw text, so the spec checks its parts.
- `captured/` holds answers recorded from a real local API by `scripts/capture-fixtures.mjs`. It is ignored by git until someone has
  reviewed it: real answers may hold names, e-mails and story text.
