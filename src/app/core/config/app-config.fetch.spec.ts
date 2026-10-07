import { provideHttpClient, withFetch } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { APP_CONFIG_TIMEOUT_MS, AppConfigStore, DEFAULT_APP_CONFIG, initAppConfig } from "./app-config";

/** `initAppConfig` over Angular's real `fetch` backend and a fake `globalThis.fetch`: no network. */
describe("initAppConfig over the real fetch backend", () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const seen: { url: string; init: RequestInit }[] = [];
  const warnings: unknown[][] = [];

  function answerWith(answer: (init: RequestInit) => Promise<Response>): void {
    const fake: typeof fetch = (input, init) => {
      seen.push({ url: String(input), init: init ?? {} });
      return answer(init ?? {});
    };
    globalThis.fetch = fake;
  }

  beforeEach(() => {
    seen.length = 0;
    warnings.length = 0;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch())] });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    vi.useRealTimers();
  });

  const run = () => TestBed.runInInjectionContext(() => initAppConfig());

  it("asks for /config.json without the browser cache and puts the file's values in the store", async () => {
    answerWith(() =>
      Promise.resolve(
        new Response('{ "actor": "alex@example.com", "apiBase": "/ahoy/api/v1" }', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await run();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("/config.json");
    expect(seen[0]?.init.cache).toBe("no-cache");
    expect(Object.keys(seen[0]?.init.headers ?? {})).toEqual(["Accept"]);
    expect(TestBed.inject(AppConfigStore).config()).toEqual({ apiBase: "/ahoy/api/v1", actor: "alex@example.com" });
    expect(warnings).toEqual([]);
  });

  it("keeps the defaults, quietly, for a server with an SPA fallback that answers an unknown path with its index.html", async () => {
    answerWith(() =>
      Promise.resolve(
        new Response("<!doctype html><title>Ahoy</title>", { status: 200, headers: { "Content-Type": "text/html" } }),
      ),
    );
    await run();
    expect(TestBed.inject(AppConfigStore).config()).toEqual(DEFAULT_APP_CONFIG);
    expect(warnings).toEqual([]);
  });

  it("keeps the defaults for a 404 and for a fetch that rejects", async () => {
    answerWith(() => Promise.resolve(new Response("Not found", { status: 404 })));
    await run();
    expect(TestBed.inject(AppConfigStore).config()).toEqual(DEFAULT_APP_CONFIG);
    answerWith(() => Promise.reject(new TypeError("Failed to fetch")));
    await run();
    expect(TestBed.inject(AppConfigStore).config()).toEqual(DEFAULT_APP_CONFIG);
  });

  it("does not keep the app from opening for longer than the timeout when the server stalls", async () => {
    vi.useFakeTimers();
    answerWith(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const started = run();
    await vi.advanceTimersByTimeAsync(APP_CONFIG_TIMEOUT_MS);
    await started;
    expect(TestBed.inject(AppConfigStore).config()).toEqual(DEFAULT_APP_CONFIG);
    expect(APP_CONFIG_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });
});
