import { fail, ok, type ApiError, type ApiResult, type ProblemError } from "@core/api/api-error";
import { CommandRunner, classifyCommandError, type CommandTarget } from "./command-runner";

function problem(status: number, code: string, extra: Partial<ProblemError> = {}): ProblemError {
  return { kind: "problem", status, code, title: code, ...extra };
}

/** A target whose version and refreshes the spec controls and counts. */
class FakeTarget implements CommandTarget {
  current: number | null = 7;
  refreshes = 0;
  onRefresh: () => void = () => undefined;

  version(): number | null {
    return this.current;
  }

  async refresh(): Promise<void> {
    this.refreshes++;
    this.onRefresh();
  }
}

/** A promise the spec resolves by hand. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("CommandRunner", () => {
  it("sends the version the user saw as expectedVersion and returns the answer", async () => {
    const target = new FakeTarget();
    const runner = new CommandRunner(target);
    const versions: number[] = [];
    const outcome = await runner.run(async (version) => {
      versions.push(version);
      return ok("stopped");
    });
    expect(versions).toEqual([7]);
    expect(outcome).toEqual({ kind: "ok", value: "stopped" });
    expect(target.refreshes).toBe(0);
  });

  it("hands a successful answer to onOk before it resolves", async () => {
    const runner = new CommandRunner(new FakeTarget());
    const accepted: string[] = [];
    await runner.run(async () => ok("story v8"), { onOk: (value) => accepted.push(value) });
    expect(accepted).toEqual(["story v8"]);
  });

  it("sends one request for a double click and skips the second", async () => {
    const runner = new CommandRunner(new FakeTarget());
    const answer = deferred<ApiResult<string>>();
    let sent = 0;
    const send = () => {
      sent++;
      return answer.promise;
    };
    const first = runner.run(send);
    const second = await runner.run(send);
    expect(second).toEqual({ kind: "skipped" });
    expect(runner.pending()).toBe(true);
    answer.resolve(ok("done"));
    expect(await first).toEqual({ kind: "ok", value: "done" });
    expect(sent).toBe(1);
    expect(runner.pending()).toBe(false);
  });

  it("takes a new command once the previous one has answered, even with an error", async () => {
    const runner = new CommandRunner(new FakeTarget());
    await runner.run(async () => fail({ kind: "network" }));
    const outcome = await runner.run(async () => ok(1));
    expect(outcome.kind).toBe("ok");
  });

  it("skips without a request while the story is not loaded", async () => {
    const target = new FakeTarget();
    target.current = null;
    let sent = 0;
    const outcome = await new CommandRunner(target).run(async () => {
      sent++;
      return ok(1);
    });
    expect(outcome).toEqual({ kind: "skipped" });
    expect(sent).toBe(0);
  });

  it("reads the story again on stale_version before resolving, so a resend carries the new version", async () => {
    const target = new FakeTarget();
    target.onRefresh = () => (target.current = 9);
    const runner = new CommandRunner(target);
    const versions: number[] = [];
    const send = async (version: number): Promise<ApiResult<string>> => {
      versions.push(version);
      return version === 7 ? fail(problem(409, "stale_version", { currentVersion: 9 })) : ok("stopped");
    };
    const first = await runner.run(send);
    expect(first.kind).toBe("stale");
    expect(target.refreshes).toBe(1);
    expect(runner.pending()).toBe(false);
    expect(await runner.run(send)).toEqual({ kind: "ok", value: "stopped" });
    expect(versions).toEqual([7, 9]);
  });

  it("keeps pending until the refresh after a conflict is done", async () => {
    const target = new FakeTarget();
    const runner = new CommandRunner(target);
    let pendingDuringRefresh = false;
    target.onRefresh = () => (pendingDuringRefresh = runner.pending());
    await runner.run(async () => fail(problem(409, "invalid_state")));
    expect(pendingDuringRefresh).toBe(true);
  });

  it("refreshes after any 409 but not after other errors", async () => {
    const target = new FakeTarget();
    const runner = new CommandRunner(target);
    await runner.run(async () => fail(problem(409, "decision_already_recorded")));
    await runner.run(async () => fail(problem(409, "already_answered")));
    await runner.run(async () => fail(problem(409, "invalid_state")));
    expect(target.refreshes).toBe(3);
    await runner.run(async () => fail(problem(400, "validation_failed")));
    await runner.run(async () => fail({ kind: "network" }));
    await runner.run(async () => fail({ kind: "invalid_response", what: "stopStory: no key" }));
    expect(target.refreshes).toBe(3);
  });

  it("does not call onOk when the command fails", async () => {
    let called = false;
    await new CommandRunner(new FakeTarget()).run(async () => fail(problem(409, "stale_version")), {
      onOk: () => (called = true),
    });
    expect(called).toBe(false);
  });
});

describe("classifyCommandError", () => {
  it("names the three conflicts and puts every other error under other", () => {
    expect(classifyCommandError(problem(409, "stale_version")).kind).toBe("stale");
    expect(classifyCommandError(problem(409, "decision_already_recorded")).kind).toBe("decided");
    expect(classifyCommandError(problem(409, "already_answered")).kind).toBe("answered");
    const others: ApiError[] = [
      problem(409, "invalid_state"),
      problem(409, "revision_ceiling_reached"),
      problem(400, "validation_failed"),
      problem(404, "not_found"),
      { kind: "network" },
      { kind: "invalid_response", what: "x" },
    ];
    for (const error of others) expect(classifyCommandError(error)).toEqual({ kind: "other", error });
  });
});
