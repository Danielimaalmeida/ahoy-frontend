import { HttpClient, provideHttpClient, withFetch } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import {
  APP_CONFIG_TIMEOUT_MS,
  APP_CONFIG_URL,
  AppConfigStore,
  DEFAULT_APP_CONFIG,
  initAppConfig,
  loadAppConfig,
  parseAppConfig,
} from "./app-config";

describe("parseAppConfig", () => {
  it("reads a complete document", () => {
    const result = parseAppConfig({
      apiBase: "/ahoy/api/v1",
      actor: "alex@example.com",
      jiraBaseUrl: "https://jira.example.com",
    });
    expect(result).toEqual({
      config: { apiBase: "/ahoy/api/v1", actor: "alex@example.com", jiraBaseUrl: "https://jira.example.com" },
      problems: [],
    });
  });

  it("gives the defaults for an empty document, without a Jira URL and without a complaint", () => {
    const result = parseAppConfig({});
    expect(result).toEqual({ config: DEFAULT_APP_CONFIG, problems: [] });
    expect("jiraBaseUrl" in result.config).toBe(false);
  });

  it("treats null and an empty jiraBaseUrl as 'not set', which is how a generated file says it", () => {
    const result = parseAppConfig({ apiBase: null, actor: null, jiraBaseUrl: null });
    expect(result).toEqual({ config: DEFAULT_APP_CONFIG, problems: [] });
    expect(parseAppConfig({ jiraBaseUrl: "" })).toEqual({ config: DEFAULT_APP_CONFIG, problems: [] });
  });

  it("ignores fields it does not know", () => {
    expect(parseAppConfig({ theme: "dark", feature: { x: 1 } })).toEqual({ config: DEFAULT_APP_CONFIG, problems: [] });
  });

  it.each([[[]], [null], ["{}"], [3], [undefined]])(
    "falls back to the defaults for %o, which is not an object",
    (document) => {
      expect(parseAppConfig(document)).toEqual({ config: DEFAULT_APP_CONFIG, problems: ["it must be a JSON object"] });
    },
  );

  describe("apiBase", () => {
    it.each([
      ["/api/v1", "/api/v1"],
      ["/api/v1/", "/api/v1"],
      ["/ahoy/api/v1///", "/ahoy/api/v1"],
      ["/api", "/api"],
      ["/a.b/c_d-e~f%20g", "/a.b/c_d-e~f%20g"],
    ])("takes the path %s as %s", (value, expected) => {
      expect(parseAppConfig({ apiBase: value })).toEqual({
        config: { ...DEFAULT_APP_CONFIG, apiBase: expected },
        problems: [],
      });
    });

    it.each([
      "https://evil.example/api/v1",
      "//evil.example/api/v1",
      "api/v1",
      "/",
      "///",
      "",
      "/..",
      "/a/../b",
      "/./a",
      "/a/..",
      "/a b",
      "/a?x=1",
      "/a#x",
      "javascript:alert(1)",
      5,
      {},
    ])("refuses %o: the API is always on this origin (F9)", (value) => {
      const result = parseAppConfig({ apiBase: value });
      expect(result.config.apiBase).toBe(DEFAULT_APP_CONFIG.apiBase);
      expect(result.problems).toEqual(["apiBase must be a path on this origin, such as /api/v1"]);
    });
  });

  describe("actor", () => {
    it("is taken as written, without surrounding spaces, up to 200 characters", () => {
      expect(parseAppConfig({ actor: "  alex@example.com " }).config.actor).toBe("alex@example.com");
      expect(parseAppConfig({ actor: "a".repeat(200) }).problems).toEqual([]);
    });

    it.each(["", "   ", "a".repeat(201), "a\nb", "a\u0000b", "a\tb", 5, {}])("refuses %o", (value) => {
      const result = parseAppConfig({ actor: value });
      expect(result.config.actor).toBe(DEFAULT_APP_CONFIG.actor);
      expect(result.problems).toEqual(["actor must be 1 to 200 characters without control characters"]);
    });
  });

  describe("jiraBaseUrl", () => {
    it.each([
      ["https://jira.example.com", "https://jira.example.com"],
      ["https://jira.example.com/", "https://jira.example.com"],
      ["https://jira.example.com/jira/", "https://jira.example.com/jira"],
      ["http://localhost:8081", "http://localhost:8081"],
      ["HTTPS://JIRA.EXAMPLE.COM", "https://jira.example.com"],
    ])("takes %s as %s", (value, expected) => {
      expect(parseAppConfig({ jiraBaseUrl: value })).toEqual({
        config: { ...DEFAULT_APP_CONFIG, jiraBaseUrl: expected },
        problems: [],
      });
    });

    it.each([
      "javascript:alert(1)",
      "data:text/html,x",
      "ftp://jira.example.com",
      "https://user:secret@jira.example.com",
      "https://jira.example.com/?x=1",
      "https://jira.example.com/#top",
      "jira.example.com",
      "//jira.example.com",
      5,
      false,
    ])("refuses %o, so the button stays hidden", (value) => {
      const result = parseAppConfig({ jiraBaseUrl: value });
      expect("jiraBaseUrl" in result.config).toBe(false);
      expect(result.problems).toEqual(["jiraBaseUrl must be an http(s) URL without credentials, query or fragment"]);
    });
  });

  it("keeps the good fields and defaults the bad ones, naming each", () => {
    const result = parseAppConfig({ apiBase: "https://x", actor: "alex@example.com", jiraBaseUrl: "nope" });
    expect(result.config).toEqual({ apiBase: "/api/v1", actor: "alex@example.com" });
    expect(result.problems).toHaveLength(2);
  });
});

describe("reading /config.json at start-up", () => {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;

  beforeEach(() => {
    warnings.length = 0;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    TestBed.configureTestingModule({ providers: [provideHttpClient(withFetch()), provideHttpClientTesting()] });
  });

  afterEach(() => {
    console.warn = originalWarn;
    TestBed.inject(HttpTestingController).verify();
  });

  /** Runs the initializer, answers the request for the file with `answer`, and waits for it to finish. */
  async function start(answer: (request: ReturnType<HttpTestingController["expectOne"]>) => void): Promise<void> {
    const done = TestBed.runInInjectionContext(() => initAppConfig());
    answer(TestBed.inject(HttpTestingController).expectOne(APP_CONFIG_URL));
    await done;
  }

  it("asks for /config.json as text, afresh, and does not wait long for it", async () => {
    await start((request) => {
      expect(request.request.method).toBe("GET");
      expect(request.request.url).toBe("/config.json");
      expect(request.request.responseType).toBe("text");
      expect(request.request.cache).toBe("no-cache");
      expect(request.request.timeout).toBe(APP_CONFIG_TIMEOUT_MS);
      expect(request.request.headers.has("Authorization")).toBe(false);
      request.flush("{}");
    });
  });

  it("puts the configuration of the file in the store", async () => {
    await start((request) =>
      request.flush(
        JSON.stringify({ apiBase: "/ahoy/api/v1", actor: "alex@example.com", jiraBaseUrl: "https://jira.example.com" }),
      ),
    );
    expect(TestBed.inject(AppConfigStore).config()).toEqual({
      apiBase: "/ahoy/api/v1",
      actor: "alex@example.com",
      jiraBaseUrl: "https://jira.example.com",
    });
    expect(warnings).toEqual([]);
  });

  it("uses the defaults, quietly, when there is no file", async () => {
    await start((request) => request.flush("Not found", { status: 404, statusText: "Not Found" }));
    expect(TestBed.inject(AppConfigStore).config()).toEqual(DEFAULT_APP_CONFIG);
    expect(warnings).toEqual([]);
  });

  it("uses the defaults, quietly, when a server with an SPA fallback answers with its index.html", async () => {
    await start((request) => request.flush("<!doctype html><html><title>Ahoy</title></html>"));
    expect(TestBed.inject(AppConfigStore).config()).toEqual(DEFAULT_APP_CONFIG);
    expect(warnings).toEqual([]);
  });

  it("uses the defaults, quietly, when the file is not valid JSON", async () => {
    await start((request) => request.flush('{ "actor": '));
    expect(TestBed.inject(AppConfigStore).config()).toEqual(DEFAULT_APP_CONFIG);
    expect(warnings).toEqual([]);
  });

  it("uses the defaults, quietly, when the request fails or the server is down", async () => {
    await start((request) => request.error(new ProgressEvent("error")));
    expect(TestBed.inject(AppConfigStore).config()).toEqual(DEFAULT_APP_CONFIG);
    expect(warnings).toEqual([]);
  });

  it("warns once per bad field of a file that is JSON, and uses the default for it", async () => {
    await start((request) =>
      request.flush(JSON.stringify({ apiBase: "https://evil.example", actor: "alex@example.com" })),
    );
    expect(TestBed.inject(AppConfigStore).config()).toEqual({ ...DEFAULT_APP_CONFIG, actor: "alex@example.com" });
    expect(warnings).toEqual([
      ["config.json: apiBase must be a path on this origin, such as /api/v1; using the default"],
    ]);
  });

  it("warns when the file is JSON but not an object", async () => {
    await start((request) => request.flush("[]"));
    expect(TestBed.inject(AppConfigStore).config()).toEqual(DEFAULT_APP_CONFIG);
    expect(warnings).toEqual([["config.json: it must be a JSON object; using the default"]]);
  });

  it("loadAppConfig gives the configuration and what was wrong without touching the store", async () => {
    const http = TestBed.inject(HttpClient);
    const loaded = loadAppConfig(http);
    TestBed.inject(HttpTestingController)
      .expectOne(APP_CONFIG_URL)
      .flush(JSON.stringify({ actor: "" }));
    expect(await loaded).toEqual({
      config: DEFAULT_APP_CONFIG,
      problems: ["actor must be 1 to 200 characters without control characters"],
    });
    expect(TestBed.inject(AppConfigStore).config()).toEqual(DEFAULT_APP_CONFIG);
  });
});

describe("AppConfigStore", () => {
  it("holds the defaults until it is told otherwise, and then the new configuration", () => {
    const store = TestBed.inject(AppConfigStore);
    expect(store.config()).toEqual(DEFAULT_APP_CONFIG);
    store.set({ apiBase: "/x", actor: "a@b.c" });
    expect(store.config()).toEqual({ apiBase: "/x", actor: "a@b.c" });
  });
});
