import { fail, ok, type ApiResult } from "@core/api/api-error";
import { settle } from "@core/realtime/testing/fake-clock";
import { LeaseMap } from "./leases";
import { StoreResource, newestVersion } from "./resource";

/** A load the spec answers by hand. */
class ManualLoad<T> {
  calls = 0;
  private pending: ((result: ApiResult<T>) => void)[] = [];
  readonly load = (): Promise<ApiResult<T>> => {
    this.calls++;
    return new Promise((resolve) => this.pending.push(resolve));
  };
  answer(result: ApiResult<T>): void {
    this.pending.shift()?.(result);
  }
}

describe("StoreResource", () => {
  it("is idle until refreshed, loading without a value, then ready", async () => {
    const load = new ManualLoad<number>();
    const resource = new StoreResource(load.load);
    expect(resource.status()).toBe("idle");
    const done = resource.refresh();
    expect(resource.status()).toBe("loading");
    expect(resource.busy()).toBe(true);
    load.answer(ok(1));
    await done;
    expect(resource.status()).toBe("ready");
    expect(resource.value()).toBe(1);
    expect(resource.busy()).toBe(false);
  });

  it("stays ready with its value during a refresh", async () => {
    const load = new ManualLoad<number>();
    const resource = new StoreResource(load.load);
    const first = resource.refresh();
    load.answer(ok(1));
    await first;
    const second = resource.refresh();
    expect(resource.status()).toBe("ready");
    expect(resource.value()).toBe(1);
    expect(resource.busy()).toBe(true);
    load.answer(ok(2));
    await second;
    expect(resource.value()).toBe(2);
  });

  it("keeps the last value on an error, and clears the error on the next success", async () => {
    const load = new ManualLoad<number>();
    const resource = new StoreResource(load.load);
    const first = resource.refresh();
    load.answer(ok(1));
    await first;
    const second = resource.refresh();
    load.answer(fail({ kind: "network" }));
    await second;
    expect(resource.status()).toBe("error");
    expect(resource.error()).toEqual({ kind: "network" });
    expect(resource.value()).toBe(1);
    const third = resource.refresh();
    load.answer(ok(3));
    await third;
    expect(resource.status()).toBe("ready");
    expect(resource.error()).toBeNull();
  });

  it("never runs two loads at once: refreshes asked for meanwhile become one more load after it", async () => {
    const load = new ManualLoad<number>();
    const resource = new StoreResource(load.load);
    const a = resource.refresh();
    const b = resource.refresh();
    const c = resource.refresh();
    expect(load.calls).toBe(1);
    load.answer(ok(1));
    await settle();
    expect(load.calls).toBe(2);
    expect(resource.value()).toBe(1);
    load.answer(ok(2));
    await Promise.all([a, b, c]);
    expect(load.calls).toBe(2);
    expect(resource.value()).toBe(2);
  });

  it("takes a value from elsewhere, such as a command answer", () => {
    const resource = new StoreResource<number>(() => Promise.resolve(ok(0)));
    resource.accept(7);
    expect(resource.status()).toBe("ready");
    expect(resource.value()).toBe(7);
  });

  it("keeps the newer version when told to", async () => {
    const load = new ManualLoad<{ version: number }>();
    const resource = new StoreResource(load.load, newestVersion);
    const slow = resource.refresh();
    resource.accept({ version: 10 });
    load.answer(ok({ version: 9 }));
    await slow;
    expect(resource.value()).toEqual({ version: 10 });
    resource.accept({ version: 10 });
    resource.accept({ version: 11 });
    expect(resource.value()).toEqual({ version: 11 });
  });

  it("drops an answer that arrives after it was disposed", async () => {
    const load = new ManualLoad<number>();
    const resource = new StoreResource(load.load);
    const done = resource.refresh();
    resource.dispose();
    load.answer(ok(1));
    await done;
    expect(resource.value()).toBeUndefined();
    await resource.refresh();
    expect(load.calls).toBe(1);
  });
});

describe("LeaseMap", () => {
  class Entry {
    disposed = 0;
    dispose(): void {
      this.disposed++;
    }
  }

  it("shares one entry per key and disposes of it when the last holder lets go", () => {
    const map = new LeaseMap<string, Entry>();
    let created = 0;
    const make = () => {
      created++;
      return new Entry();
    };
    const a = map.acquire("PROJ-123", make);
    const b = map.acquire("PROJ-123", make);
    expect(created).toBe(1);
    expect(b.entry).toBe(a.entry);
    a.release();
    a.release();
    expect(a.entry.disposed).toBe(0);
    expect(map.get("PROJ-123")).toBe(a.entry);
    b.release();
    expect(a.entry.disposed).toBe(1);
    expect(map.get("PROJ-123")).toBeUndefined();
    const c = map.acquire("PROJ-123", make);
    expect(created).toBe(2);
    expect(c.entry).not.toBe(a.entry);
  });

  it("disposes of everything on clear", () => {
    const map = new LeaseMap<string, Entry>();
    const a = map.acquire("A", () => new Entry());
    const b = map.acquire("B", () => new Entry());
    map.clear();
    expect([a.entry.disposed, b.entry.disposed]).toEqual([1, 1]);
    expect(map.keys()).toEqual([]);
    a.release();
    expect(a.entry.disposed).toBe(1);
  });
});
