import type { MockAhoyServer } from "@testing/mock-backend/server";
import type { SwitchStorage } from "@testing/mock-backend/switches";
import { installMockBackend, type MockInstallHost } from "./install";

/** A page for `installMockBackend`: a global with a recording `fetch`, a storage and a log. */
function fakeHost(search = "", items: Record<string, string> = {}) {
  const seen: string[] = [];
  const logs: string[] = [];
  const store = new Map(Object.entries(items));
  const storage: SwitchStorage = {
    getItem: (key) => store.get(key) ?? null,
    removeItem: (key) => void store.delete(key),
  };
  const global: { fetch: typeof fetch; ahoyMock?: unknown } = {
    fetch: async (input) => {
      seen.push(String(input));
      return new Response("not the mock", { status: 404 });
    },
  };
  const host: MockInstallHost = { global, storage, search, log: (m) => logs.push(m) };
  return { host, global, seen, logs, store };
}

describe("installMockBackend", () => {
  let server: MockAhoyServer | null = null;
  afterEach(() => server?.close());

  it("answers /api/v1 from the mock as the proxy's default actor, and leaves other URLs to the real fetch", async () => {
    const page = fakeHost();
    server = installMockBackend(page.host);
    const created = await page.global.fetch("/api/v1/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "DEMO-1", budgetNanoAiu: 1_000_000_000 }),
    });
    expect(created.status).toBe(201);
    expect(((await created.json()) as { owner: string }).owner).toBe("dev@example.com");
    expect((await page.global.fetch("/config.json")).status).toBe(404);
    expect(page.seen).toEqual(["/config.json"]);
    expect(page.global.ahoyMock).toBe(server);
    expect(page.logs[0]).toContain("Ahoy mock backend");
  });

  it("takes the actor from localStorage, and the switches from the query string and, per request, localStorage", async () => {
    const page = fakeHost("?ahoy.mock.latencyMs=0&ahoy.mock.failNext=503", { "ahoy.mock.actor": "sam@example.com" });
    server = installMockBackend(page.host);
    expect(page.logs[0]).toContain("failNext=503");
    expect((await page.global.fetch("/api/v1/stories")).status).toBe(503);
    page.store.set("ahoy.mock.conflictNext", "invalid_state");
    const conflict = await page.global.fetch("/api/v1/stories/PROJ-118/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: 14 }),
    });
    expect(((await conflict.json()) as { code: string }).code).toBe("invalid_state");
    expect(page.store.has("ahoy.mock.conflictNext")).toBe(false);
    expect(page.logs.at(-1)).toBe("Ahoy mock: conflictNext=invalid_state");
    const created = await page.global.fetch("/api/v1/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "DEMO-2", budgetNanoAiu: 1_000_000_000 }),
    });
    expect(((await created.json()) as { owner: string }).owner).toBe("sam@example.com");
  });
});
