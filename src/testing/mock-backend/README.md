# Mock backend

An in-memory, deterministic double of the Ahoy API (`openapi/ahoy-v1.yaml`), for developing and testing without an API,
Docker or Postgres (lane 2D). **It is a double of the contract, not the source of truth:** `conformance.spec.ts` checks
every answer against the YAML with Ajv (the 2A helper `src/testing/fixtures/contract.ts`). All data is fictional.

The same `MockAhoyServer` runs in three places, never as two mocks:

| Where                | How                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run start:mock` | `src/environments/environment.mock.ts` calls `installMockBackend()` (`src/app/core/mock/install.ts`), which puts the mock behind the page's `fetch`. |
| `npm run mock:api`   | `scripts/mock-api.mjs` serves it over `node:http` on `127.0.0.1:8080`; `npm start` beside it goes through the real dev proxy.                        |
| Specs                | `testServer()` (`spec-helpers.ts`) on a `ManualClock`; `provideMockBackend(server)` and `mockBackendInterceptor` for `TestBed`.                      |

## What it does

- **Routing and checks like the real server** (`apps/api/src/server.ts` of `ahoy-hosted`): routes come from the contract's
  `paths`; every path, query, header and body is checked against the contract's schemas (`schema.ts`, Ajv's wording, paths
  `body/...`, `query.limit`); unknown or repeated query parameters, an unknown route (`404`), a wrong method (`400` with
  `Allow`); `X-Ahoy-Actor` is the actor (`401` without it, `/health` aside).
- **The 19 operations of phases 3 to 6**, with versions (`409 stale_version` and `currentVersion`), `story_exists`,
  `invalid_state`, `already_answered`, `decision_already_recorded` (only through `conflictNext`: as in the real API, an
  open gate never holds a decision), `revision_ceiling_reached` (ceiling 4), `unsupported_gate` (`422`), `validation_failed`
  (with `errors`; two reviewers on one model), `not_found`. The four operations of phase 7 answer `500 internal_error`.
- **A simulated reconciler** (`simulator.ts`): a `ready` story gets a run (queued, dispatched, `run.progress` batches of steps
  closed by a `spend`, finished, judged by its gate) or, at a human gate, `awaiting_decision`. intake → planning (the first
  planning run asks two questions; after the answers it writes `implementation-plan.md`) → plan_review → implementation →
  pr_review (one run per reviewer lens) → delivery_gate → done. `send_back` archives the plan as
  `implementation-plan.round<N>.md` and plans again with the reason; `reject` → blocked; stop cancels the run; a run that
  costs more than the story has left halts it on `budget_exhausted`.
- **`GET /events/stream`**: `: connected`, the events after `Last-Event-ID` (or `after`), then new ones as they happen, and
  `: keepalive` after 15 s of silence.
- **Eight seeded voyages** (`seeds.ts`): PROJ-123, 131, 140, 118, 126, 109, 097 and 102, as the wireframes show them. Every
  time is relative to the start (in specs, `SEED_AT`, Tuesday 6 October 2026 10:10 UTC).

## Switches

In the browser: the query string (`?ahoy.mock.latencyMs=300`) or `localStorage` (`localStorage.setItem("ahoy.mock.failNext",
"503")`, read before each request); `ahoyMock` in the console is the server. On `mock:api`:
`curl 'localhost:8080/__mock/switches?failNext=503'` and `curl localhost:8080/__mock/reset`.

| Name           | Value                | Effect                                                            |
| -------------- | -------------------- | ----------------------------------------------------------------- |
| `latencyMs`    | 0 to 60000           | every answer waits that long (stays set)                          |
| `failNext`     | 400 to 599           | the next request answers that status (502 and 504: an HTML page)  |
| `conflictNext` | a 409 code, or `1`   | the next valid command answers `409` (`stale_version` by default) |
| `dropStream`   | anything             | open event streams break; clients resume with `Last-Event-ID`     |
| `actor`        | an id (browser only) | the `X-Ahoy-Actor` the page sends (default `dev@example.com`)     |

## Rules for this directory

- Plain TypeScript, no Angular: it runs in Node 24 by type stripping. So no `enum`, `namespace` or parameter properties, only
  `import type` for types, and runtime imports only of files in this directory.
- Never imported by production code: `scripts/mock-api.dist-check.mjs` fails when a production `dist/` holds a trace of it.
