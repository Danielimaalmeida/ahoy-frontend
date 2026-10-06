# Fixtures

Answers of the Ahoy API (`openapi/ahoy-v1.yaml`, 1.0.0-poc), written by hand for tests. **All data is fictional**, taken from the
wireframes: PROJ-123 in plan review (round 2 of 4), PROJ-131 with open questions, PROJ-140 running, alex@example.com and friends.
Never put real story content here (CLAUDE.md).

| File                                                                                | Operation(s)                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<operationId>.json` (`getHealth`, `listStories`, `getStory`, `listStoryRuns`, ...) | The body of the successful answer of that operation.                                                                                                                                                 |
| `startStory.json`, `stopStory.json`, `resumeStory.json`, `setStoryBudget.json`      | A `Story` each: the 201 or 202 answer of that command.                                                                                                                                               |
| `setStoryModels.json`                                                               | The `ModelPlan` after the change.                                                                                                                                                                    |
| `getArtifactContent.json`                                                           | `{ path, mediaType, etag, text }`: the text the API sends (a raw body, not JSON), and the headers a client reads. The `etag` is the quoted sha256 that `listArtifacts.json` lists for the same file. |
| `problems.json`                                                                     | One `application/problem+json` body per problem code (15), in the shape the real API sends.                                                                                                          |
| `mutate.ts`                                                                         | `withField` and `withoutField`, to break a fixture one field at a time in a test.                                                                                                                    |

Rules:

- Import them with the alias, for example `import story from "@testing/fixtures/getStory.json"`. JSON imports work in specs.
- Keep each one valid against the contract. Until `contract.spec.ts` exists (lane 2A, waiting for `ajv` and `yaml`), the guards of
  `core/api` are what checks them (`guards.spec.ts` accepts every one).
- `captured/` holds answers recorded from a real local API by `scripts/capture-fixtures.mjs`. It is ignored by git until someone has
  reviewed it: real answers may hold names, e-mails and story text.
