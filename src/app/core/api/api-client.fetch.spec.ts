import { provideHttpClient, withFetch } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import getArtifactContent from "@testing/fixtures/getArtifactContent.json";
import getHealth from "@testing/fixtures/getHealth.json";
import getStory from "@testing/fixtures/getStory.json";
import problems from "@testing/fixtures/problems.json";
import { API_BASE } from "./api-base";
import { ApiClient, REQUEST_TIMEOUT_MS } from "./api-client";

/**
 * `ApiClient` over Angular's real `fetch` backend, with a fake `globalThis.fetch` that answers with real `Response`
 * objects. `HttpTestingController` replaces the backend, so it cannot show how the backend itself hands over a 304, a
 * `problem+json` body, a gateway page or a timeout; this does. Nothing here touches the network.
 */
describe("ApiClient over the real fetch backend", () => {
  interface Seen {
    readonly url: string;
    readonly init: RequestInit;
  }
  const originalFetch = globalThis.fetch;
  let seen: Seen[];

  /** Replaces `fetch` with `answer`, which sees each request. */
  function answerWith(answer: (url: string, init: RequestInit) => Promise<Response>): void {
    const fake: typeof fetch = (input, init) => {
      const request = { url: String(input), init: init ?? {} };
      seen.push(request);
      return answer(request.url, request.init);
    };
    globalThis.fetch = fake;
  }

  const json = (body: unknown, status = 200, type = "application/json") =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": type } }));

  beforeEach(() => {
    seen = [];
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), { provide: API_BASE, useValue: "/api/v1" }],
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("sends a GET with nothing but Accept: no Authorization, no actor", async () => {
    answerWith(() => json(getStory));
    const result = await TestBed.inject(ApiClient).getStory("PROJ-123");
    expect(result).toEqual({ ok: true, value: getStory });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("/api/v1/stories/PROJ-123");
    expect(seen[0]?.init.method).toBe("GET");
    expect(Object.keys(seen[0]?.init.headers ?? {})).toEqual(["Accept"]);
  });

  it("sends a POST as JSON with the Content-Type and nothing else added", async () => {
    answerWith(() => json({ ...getStory, status: "halted", haltReason: "stopped_by_user" }, 202));
    const body = { expectedVersion: 9, reason: "Wrong repository." };
    const result = await TestBed.inject(ApiClient).stopStory("PROJ-123", body);
    expect(result.ok).toBe(true);
    expect(seen[0]?.init.method).toBe("POST");
    expect(seen[0]?.init.body).toBe(JSON.stringify(body));
    expect(Object.keys(seen[0]?.init.headers ?? {}).sort()).toEqual(["Accept", "Content-Type"]);
    expect((seen[0]?.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("reads the problem+json body of an error answer", async () => {
    const stale = problems.find((p) => p.code === "stale_version")!;
    answerWith(() => json(stale, 409, "application/problem+json; charset=utf-8"));
    const result = await TestBed.inject(ApiClient).stopStory("PROJ-123", { expectedVersion: 8, reason: "x" });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: "problem", status: 409, code: "stale_version", currentVersion: 9 }),
    });
  });

  it.each([502, 503, 504])("calls a gateway page (%i, HTML) a network failure with its status", async (status) => {
    answerWith(() =>
      Promise.resolve(
        new Response("<html><h1>Bad gateway</h1></html>", { status, headers: { "Content-Type": "text/html" } }),
      ),
    );
    expect(await TestBed.inject(ApiClient).getHealth()).toEqual({ ok: false, error: { kind: "network", status } });
  });

  it("calls an HTML page that comes with a 200 an invalid response, not a value", async () => {
    answerWith(() =>
      Promise.resolve(
        new Response("<!doctype html><title>Sign in</title>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    expect(await TestBed.inject(ApiClient).getHealth()).toEqual({
      ok: false,
      error: { kind: "invalid_response", what: "getHealth: the body is not valid JSON" },
    });
  });

  it("calls an error answer with a body that is not problem details an invalid response", async () => {
    answerWith(() => json({ message: "nope" }, 401));
    expect(await TestBed.inject(ApiClient).getHealth()).toEqual({
      ok: false,
      error: { kind: "invalid_response", what: "getHealth: HTTP 401 without problem details" },
    });
  });

  it("calls a fetch that rejects (offline, refused, DNS) a network failure", async () => {
    answerWith(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await TestBed.inject(ApiClient).getHealth()).toEqual({ ok: false, error: { kind: "network" } });
  });

  it("gives up on a request that never answers after the timeout, as a network failure", async () => {
    vi.useFakeTimers();
    answerWith(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const pending = TestBed.inject(ApiClient).getHealth();
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, error: { kind: "network" } });
  });

  it("answers a healthy API's health", async () => {
    answerWith(() => json(getHealth));
    expect(await TestBed.inject(ApiClient).getHealth()).toEqual({ ok: true, value: getHealth });
  });

  describe("artifact content", () => {
    const query = { path: "implementation-plan.md" } as const;

    it("gives the text with its ETag and media type", async () => {
      answerWith(() =>
        Promise.resolve(
          new Response(getArtifactContent.text, {
            status: 200,
            headers: { "Content-Type": "text/markdown; charset=utf-8", ETag: getArtifactContent.etag },
          }),
        ),
      );
      expect(await TestBed.inject(ApiClient).getArtifactContent("PROJ-123", query)).toEqual({
        ok: true,
        value: {
          kind: "content",
          text: getArtifactContent.text,
          etag: getArtifactContent.etag,
          mediaType: "text/markdown; charset=utf-8",
        },
      });
      expect(seen[0]?.url).toBe("/api/v1/stories/PROJ-123/artifacts/content?path=implementation-plan.md");
    });

    it("sends If-None-Match, and a 304 with no body is 'not modified'", async () => {
      answerWith(() =>
        Promise.resolve(new Response(null, { status: 304, headers: { ETag: getArtifactContent.etag } })),
      );
      const result = await TestBed.inject(ApiClient).getArtifactContent("PROJ-123", {
        ...query,
        ifNoneMatch: getArtifactContent.etag,
      });
      expect(result).toEqual({ ok: true, value: { kind: "not_modified" } });
      expect((seen[0]?.init.headers as Record<string, string>)["If-None-Match"]).toBe(getArtifactContent.etag);
    });

    it("decodes the text as UTF-8, accents included", async () => {
      answerWith(() =>
        Promise.resolve(
          new Response("Cliente: José — fatura nº 1", { status: 200, headers: { "Content-Type": "text/plain" } }),
        ),
      );
      const result = await TestBed.inject(ApiClient).getArtifactContent("PROJ-123", query);
      expect(result).toEqual({
        ok: true,
        value: { kind: "content", text: "Cliente: José — fatura nº 1", etag: null, mediaType: "text/plain" },
      });
    });

    it("reads the problem details of a 404 although the body is asked for as text", async () => {
      const notFound = problems.find((p) => p.code === "not_found")!;
      answerWith(() => json(notFound, 404, "application/problem+json"));
      expect(await TestBed.inject(ApiClient).getArtifactContent("PROJ-123", query)).toEqual({
        ok: false,
        error: expect.objectContaining({ kind: "problem", status: 404, code: "not_found" }),
      });
    });
  });
});
