import {
  call,
  field,
  problemCode,
  settle,
  StreamTap,
  testServer,
} from './spec-helpers';
import { createMockFetch } from './fetch-adapter';
import {
  applyQuerySwitches,
  applyStorageSwitches,
  applySwitches,
  type SwitchStorage,
} from './switches';

/** A `localStorage` stand-in. */
class FakeStorage implements SwitchStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

describe('mock switches', () => {
  it('failNext answers the next request with that status as a problem, once', () => {
    const { server } = testServer();
    server.switches.failNext = 503;
    const failed = call(server, 'GET', '/stories');
    expect([failed.status, problemCode(failed)]).toEqual([503, 'unavailable']);
    expect(call(server, 'GET', '/stories').status).toBe(200);
    server.switches.failNext = 500;
    expect(problemCode(call(server, 'GET', '/health'))).toBe('internal_error');
  });

  it("failNext=502 answers a gateway's HTML page, which has no problem details", () => {
    const { server } = testServer();
    server.switches.failNext = 502;
    const failed = call(server, 'GET', '/stories');
    expect([failed.status, failed.headers['Content-Type']]).toEqual([
      502,
      'text/html',
    ]);
    expect(String(failed.body)).toContain('Bad Gateway');
  });

  it('failNext=409 answers stale_version with the version of the story the path names', () => {
    const { server } = testServer();
    server.switches.failNext = 409;
    const failed = call(server, 'GET', '/stories/PROJ-123');
    expect([
      failed.status,
      problemCode(failed),
      field(failed, 'currentVersion'),
    ]).toEqual([409, 'stale_version', 9]);
  });

  it("conflictNext answers the next valid command with a 409, stale_version with the story's version", () => {
    const { server } = testServer();
    server.switches.conflictNext = 'stale_version';
    expect(call(server, 'GET', '/stories/PROJ-123').status).toBe(200); // reads are not commands
    const invalid = call(server, 'POST', '/stories/PROJ-123/stop', {
      expectedVersion: 9,
    });
    expect(problemCode(invalid)).toBe('validation_failed'); // checked before the switch
    const conflict = call(server, 'POST', '/stories/PROJ-123/stop', {
      expectedVersion: 9,
      reason: 'x',
    });
    expect([
      conflict.status,
      problemCode(conflict),
      field(conflict, 'currentVersion'),
    ]).toEqual([409, 'stale_version', 9]);
    expect(call(server, 'GET', '/stories/PROJ-123').body).toMatchObject({
      status: 'awaiting_decision',
      version: 9,
    });
    server.switches.conflictNext = 'decision_already_recorded';
    const decided = call(server, 'POST', '/stories/PROJ-123/decisions', {
      gate: 'plan_accepted',
      decision: 'approve',
      expectedVersion: 9,
    });
    expect(problemCode(decided)).toBe('decision_already_recorded');
    expect(server.switches.conflictNext).toBeNull();
  });

  it('dropStream breaks the open streams', async () => {
    const { server } = testServer({ seed: false });
    const response = await createMockFetch(server, {
      actor: () => 'a@example.com',
    })('/api/v1/events/stream');
    const tap = new StreamTap(response.body!);
    await settle();
    expect(
      applySwitches(server, (name) => (name === 'dropStream' ? '1' : null))
        .applied
    ).toEqual(['dropStream=1']);
    await settle();
    expect(tap.error).toBeInstanceOf(TypeError);
  });

  it('reads values by name and refuses the ones it cannot use', () => {
    const { server } = testServer();
    const values: Record<string, string> = {
      latencyMs: '120',
      failNext: '200',
      conflictNext: 'nonsense',
    };
    const result = applySwitches(server, (name) => values[name] ?? null);
    expect(result).toEqual({
      applied: ['latencyMs=120'],
      refused: ['failNext=200', 'conflictNext=nonsense'],
    });
    expect(server.switches).toEqual({
      latencyMs: 120,
      failNext: null,
      conflictNext: null,
    });
    expect(
      applySwitches(server, (name) => (name === 'conflictNext' ? '1' : null))
        .applied
    ).toEqual(['conflictNext=1']);
    expect(server.switches.conflictNext).toBe('stale_version');
  });

  it('reads `ahoy.mock.*` from localStorage, forgetting the one-shots it applied', () => {
    const { server } = testServer();
    const storage = new FakeStorage();
    storage.items.set('ahoy.mock.latencyMs', '300');
    storage.items.set('ahoy.mock.failNext', '503');
    expect(applyStorageSwitches(server, storage)).toEqual([
      'latencyMs=300',
      'failNext=503',
    ]);
    expect([...storage.items.keys()]).toEqual(['ahoy.mock.latencyMs']);
    expect(applyStorageSwitches(server, null)).toEqual([]);
    const blocked: SwitchStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    expect(applyStorageSwitches(server, blocked)).toEqual([]);
  });

  it('reads `ahoy.mock.*` from a query string', () => {
    const { server } = testServer();
    expect(
      applyQuerySwitches(
        server,
        '?status=halted&ahoy.mock.latencyMs=50&ahoy.mock.conflictNext=invalid_state'
      )
    ).toEqual(['latencyMs=50', 'conflictNext=invalid_state']);
  });
});
