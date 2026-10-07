import { HttpClient, provideHttpClient, withFetch, withInterceptors } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { API_BASE } from "@core/api/api-base";
import { AUTH_STRATEGY, NoAuthStrategy, type AuthStrategy } from "./auth-strategy";
import { authInterceptor } from "./auth.interceptor";

/** Lets the interceptor's promise settle: it asks the strategy before the request reaches the backend. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve));

function configure(strategy?: AuthStrategy, base = "/api/v1"): void {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: API_BASE, useValue: base },
      ...(strategy ? [{ provide: AUTH_STRATEGY, useValue: strategy }] : []),
    ],
  });
}

describe("NoAuthStrategy", () => {
  it("adds no headers at all", async () => {
    expect(await new NoAuthStrategy().headers()).toEqual({});
  });

  it("is the strategy in force unless one is provided", () => {
    configure();
    expect(TestBed.inject(AUTH_STRATEGY)).toBeInstanceOf(NoAuthStrategy);
  });
});

describe("authInterceptor", () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  describe("with the default strategy", () => {
    it("leaves a request to the API exactly as it was: no Authorization, no header at all", async () => {
      configure();
      TestBed.inject(HttpClient).get("/api/v1/stories").subscribe();
      await settle();
      const request = TestBed.inject(HttpTestingController).expectOne("/api/v1/stories").request;
      expect(request.headers.has("Authorization")).toBe(false);
      expect(request.headers.keys()).toEqual([]);
    });

    it("leaves a POST alone too", async () => {
      configure();
      TestBed.inject(HttpClient).post("/api/v1/stories", { key: "PROJ-1" }).subscribe();
      await settle();
      const request = TestBed.inject(HttpTestingController).expectOne("/api/v1/stories").request;
      expect(request.headers.keys()).toEqual([]);
      expect(request.body).toEqual({ key: "PROJ-1" });
    });
  });

  describe("with a strategy that has headers (the extension point)", () => {
    const strategy: AuthStrategy = { headers: () => Promise.resolve({ "X-Test-Token": "t1" }) };

    it("adds them to requests to the API", async () => {
      configure(strategy);
      const http = TestBed.inject(HttpClient);
      http.get("/api/v1/stories").subscribe();
      http.get("/api/v1").subscribe();
      await settle();
      const controller = TestBed.inject(HttpTestingController);
      expect(controller.expectOne("/api/v1/stories").request.headers.get("X-Test-Token")).toBe("t1");
      expect(controller.expectOne("/api/v1").request.headers.get("X-Test-Token")).toBe("t1");
    });

    it("keeps the other headers of the request", async () => {
      configure(strategy);
      TestBed.inject(HttpClient)
        .get("/api/v1/stories", { headers: { "If-None-Match": '"x"' } })
        .subscribe();
      await settle();
      const request = TestBed.inject(HttpTestingController).expectOne("/api/v1/stories").request;
      expect(request.headers.get("If-None-Match")).toBe('"x"');
      expect(request.headers.get("X-Test-Token")).toBe("t1");
    });

    it.each(["/config.json", "/api/v10/stories", "/api/v1x", "https://elsewhere.example/api/v1/stories", "/other"])(
      "does not add them to %s: they are for the API only",
      async (url) => {
        configure(strategy);
        TestBed.inject(HttpClient).get(url).subscribe();
        await settle();
        expect(TestBed.inject(HttpTestingController).expectOne(url).request.headers.has("X-Test-Token")).toBe(false);
      },
    );

    it("follows the base the API is served from, trailing slash or not", async () => {
      configure(strategy, "/ahoy/api/v1/");
      const http = TestBed.inject(HttpClient);
      http.get("/ahoy/api/v1/stories").subscribe();
      http.get("/api/v1/stories").subscribe();
      await settle();
      const controller = TestBed.inject(HttpTestingController);
      expect(controller.expectOne("/ahoy/api/v1/stories").request.headers.has("X-Test-Token")).toBe(true);
      expect(controller.expectOne("/api/v1/stories").request.headers.has("X-Test-Token")).toBe(false);
    });

    it("asks the strategy for every request, so a token that expires is refreshed", async () => {
      let calls = 0;
      configure({
        headers: () => {
          calls += 1;
          return Promise.resolve({ "X-Test-Token": `t${calls}` });
        },
      });
      const http = TestBed.inject(HttpClient);
      http.get("/api/v1/a").subscribe();
      http.get("/api/v1/b").subscribe();
      await settle();
      const controller = TestBed.inject(HttpTestingController);
      expect(controller.expectOne("/api/v1/a").request.headers.get("X-Test-Token")).toBe("t1");
      expect(controller.expectOne("/api/v1/b").request.headers.get("X-Test-Token")).toBe("t2");
    });
  });

  describe("with a strategy that fails", () => {
    it("fails the request with that error and sends nothing", async () => {
      configure({ headers: () => Promise.reject(new Error("token refresh failed")) });
      const errors: unknown[] = [];
      TestBed.inject(HttpClient)
        .get("/api/v1/stories")
        .subscribe({ error: (e: unknown) => errors.push(e) });
      await settle();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Error);
      expect((errors[0] as Error).message).toBe("token refresh failed");
      TestBed.inject(HttpTestingController).expectNone("/api/v1/stories");
    });
  });
});
