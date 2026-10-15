import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fail, ok, type ApiError, type ApiResult } from '@core/api/api-error';
import type { AhoyEvent, Story, UnblockStoryRequest } from '@core/api/types';
import { aStory, anEvent } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { requestViolations } from '@testing/fixtures/contract';
import { VoyageContext } from '../context/voyage-context';
import { VoyageHeader } from '../header/voyage-header';

const REASON = 'The dependency is available for another rework round.';
const WARNING =
  'Unblocking permits more work and may spend AIU. It does not approve the delivery or waive acceptance criteria.';

describe('Unblock from the voyage header', () => {
  let api: FakeApi;
  let story: Story;
  let state: Record<string, unknown>;
  let events: readonly AhoyEvent[];
  let answers: (() => Promise<ApiResult<Story>>)[];
  let fixture: ComponentFixture<VoyageHeader>;

  beforeEach(() => {
    story = aStory('PROJ-131', {
      phase: 'blocked',
      status: 'terminal',
      version: 73,
    });
    state = {
      child_repos: [
        { repo: 'frontend' },
        { repo: 'backend' },
        { repo: 'frontend' },
      ],
      decision_log: [],
    };
    events = [];
    answers = [];
    api = new FakeApi();
    const net = new FakeFetch();
    net.stream();
    api
      .on('getStory', () => Promise.resolve(ok(story)))
      .on('getStoryState', (key) =>
        Promise.resolve(ok({ key, version: story.version, state }))
      )
      .on('listStoryRuns', () => Promise.resolve(ok([])))
      .on('listQuestions', () => Promise.resolve(ok([])))
      .on('listGateRecords', () => Promise.resolve(ok([])))
      .on('getStoryModels', (key) =>
        Promise.resolve(
          ok({ storyKey: key, version: story.version, slots: [] })
        )
      )
      .on('listStoryEvents', () =>
        Promise.resolve(ok({ items: events, lastEventId: null }))
      )
      .on('unblockStory', () => {
        const next = answers.shift();
        if (next !== undefined) return next();
        story = {
          ...story,
          phase: 'implementation',
          status: 'ready',
          version: story.version + 1,
        };
        state = {
          ...state,
          decision_log: [{ type: 'unblock', reason: REASON }],
        };
        events = [
          { ...anEvent(1, 'story.unblocked', {}), storyKey: story.key },
        ];
        return Promise.resolve(ok(story));
      });
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock: new FakeClock(), net }),
        provideRouter([]),
        VoyageContext,
      ],
    });
  });

  afterEach(() => {
    document.querySelector('.cdk-overlay-container')?.replaceChildren();
  });

  async function flush(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await settle();
      await fixture.whenStable();
    }
  }

  async function render(): Promise<HTMLElement> {
    TestBed.inject(VoyageContext).open(story.key);
    fixture = TestBed.createComponent(VoyageHeader);
    await flush();
    return fixture.nativeElement as HTMLElement;
  }

  function text(root: Element): string {
    return (root.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function button(root: Element, name: string): HTMLButtonElement {
    const found = [...root.querySelectorAll('button')].find(
      (item) => text(item) === name
    );
    if (found === undefined) throw new Error(`No button ${name}`);
    return found;
  }

  function dialog(): HTMLElement {
    const found = document.querySelector<HTMLElement>(
      '.cdk-overlay-container .ah-dialog'
    );
    if (found === null) throw new Error('No dialog');
    return found;
  }

  function hasDialog(): boolean {
    return document.querySelector('.cdk-overlay-container .ah-dialog') !== null;
  }

  async function open(): Promise<void> {
    button(await render(), 'Unblock').click();
    await flush();
  }

  function type(selector: string, value: string): void {
    const control = dialog().querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >(selector);
    if (control === null) throw new Error(`No control ${selector}`);
    control.value = value;
    control.dispatchEvent(new Event('input'));
    control.dispatchEvent(new Event('blur'));
  }

  function tick(): void {
    dialog().querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
  }

  function selectRepos(repos: readonly string[]): void {
    const select = dialog().querySelector('select')!;
    for (const option of select.options)
      option.selected = repos.includes(text(option));
    select.dispatchEvent(new Event('change'));
  }

  async function prepare(reason = REASON): Promise<void> {
    type('textarea', reason);
    tick();
    await flush();
  }

  function requests(): readonly unknown[] {
    return api.callsOf('unblockStory').map((call) => call.args);
  }

  function conflict(code = 'stale_version'): Promise<ApiResult<Story>> {
    return Promise.resolve(
      fail({
        kind: 'problem',
        status: 409,
        code,
        title: 'Voyage changed',
        currentVersion: story.version,
      })
    );
  }

  it('offers Unblock for a blocked/terminal voyage and explains exactly what it permits', async () => {
    await open();
    expect(text(dialog())).toContain('Unblock PROJ-131?');
    expect(text(dialog())).toContain(WARNING);
    expect(text(dialog())).toContain(
      'The reason is recorded in the decision history, not sent as an implementation instruction.'
    );
    expect(text(dialog())).toContain(
      "A voyage blocked by a person's rejection at a human gate cannot be unblocked."
    );
    expect(
      dialog().querySelector<HTMLInputElement>('input[type=number]')?.value
    ).toBe('1');
    expect(
      [...dialog().querySelectorAll('option')].map((option) => text(option))
    ).toEqual(['frontend', 'backend']);
    expect(button(dialog(), 'Unblock').disabled).toBe(true);
    button(dialog(), 'Cancel').click();
    await flush();
    expect(requests()).toEqual([]);
    expect(hasDialog()).toBe(false);
  });

  it('keeps Resume for a halted voyage and does not offer Unblock for another phase', async () => {
    story = { ...story, phase: 'implementation', status: 'halted' };
    const root = await render();
    expect(
      [...root.querySelectorAll('button')].some(
        (item) => text(item) === 'Unblock'
      )
    ).toBe(false);
    expect(button(root, 'Resume…')).toBeDefined();
  });

  it('also offers Unblock when the blocked voyage is halted', async () => {
    story = { ...story, status: 'halted' };
    const root = await render();
    expect(button(root, 'Unblock')).toBeDefined();
    expect(button(root, 'Resume…')).toBeDefined();
  });

  it('requires a nonblank reason of at most 5000 characters, with explicit confirmation', async () => {
    await open();
    await prepare('   \n\t ');
    expect(text(dialog())).toContain('A reason is required.');
    expect(button(dialog(), 'Unblock').disabled).toBe(true);
    type('textarea', 'x'.repeat(5001));
    await flush();
    expect(text(dialog())).toContain('At most 5000 characters.');
    expect(button(dialog(), 'Unblock').disabled).toBe(true);
    type('textarea', 'x'.repeat(5000));
    await flush();
    expect(button(dialog(), 'Unblock').disabled).toBe(false);
    tick();
    await flush();
    expect(button(dialog(), 'Unblock').disabled).toBe(true);
    expect(requests()).toEqual([]);
  });

  it.each(['', '0', '-1', '11', '1.5'])(
    'rejects invalid round count %j',
    async (rounds) => {
      await open();
      await prepare();
      type('input[type=number]', rounds);
      await flush();
      expect(button(dialog(), 'Unblock').disabled).toBe(true);
      expect(
        dialog()
          .querySelector('input[type=number]')
          ?.getAttribute('aria-invalid')
      ).toBe('true');
      expect(requests()).toEqual([]);
    }
  );

  it('sends the trimmed reason, current loaded version and default rounds, omitting repos when none are selected', async () => {
    await open();
    story = { ...story, version: 81 };
    await TestBed.inject(VoyageContext).refresh();
    await prepare(`  ${REASON}\n`);
    button(dialog(), 'Unblock').click();
    await flush();
    const body = {
      expectedVersion: 81,
      rounds: 1,
      reason: REASON,
    } satisfies UnblockStoryRequest;
    expect(requests()).toEqual([['PROJ-131', body]]);
    expect(requestViolations('unblockStory', body)).toEqual([]);
    expect(hasDialog()).toBe(false);
  });

  it('sends only selected repository aliases and supports the upper round limit', async () => {
    await open();
    await prepare();
    type('input[type=number]', '10');
    selectRepos(['frontend']);
    await flush();
    button(dialog(), 'Unblock').click();
    await flush();
    const body = {
      expectedVersion: 73,
      rounds: 10,
      repos: ['frontend'],
      reason: REASON,
    } satisfies UnblockStoryRequest;
    expect(requests()).toEqual([['PROJ-131', body]]);
    expect(requestViolations('unblockStory', body)).toEqual([]);
  });

  it('refreshes the story, decision state, gates and activity history after success', async () => {
    await open();
    await prepare();
    button(dialog(), 'Unblock').click();
    await flush();
    const context = TestBed.inject(VoyageContext);
    expect(context.story()?.phase).toBe('implementation');
    expect(context.version()).toBe(74);
    expect(context.handle()?.state.value()?.state['decision_log']).toEqual([
      { type: 'unblock', reason: REASON },
    ]);
    expect(context.events().map((event) => event.type)).toEqual([
      'story.unblocked',
    ]);
    for (const op of [
      'getStory',
      'getStoryState',
      'listGateRecords',
      'listStoryEvents',
    ] as const)
      expect(api.callsOf(op)).toHaveLength(2);
    expect(hasDialog()).toBe(false);
  });

  it('allows up to 50 repositories but not 51', async () => {
    const repos = Array.from({ length: 51 }, (_, index) => `repo-${index}`);
    state = { child_repos: repos.map((repo) => ({ repo })) };
    await open();
    await prepare();
    selectRepos(repos);
    await flush();
    expect(text(dialog())).toContain('Select at most 50 repositories.');
    expect(button(dialog(), 'Unblock').disabled).toBe(true);
    expect(requests()).toEqual([]);
    selectRepos(repos.slice(0, 50));
    await flush();
    expect(button(dialog(), 'Unblock').disabled).toBe(false);
    button(dialog(), 'Unblock').click();
    await flush();
    const body = {
      expectedVersion: 73,
      reason: REASON,
      rounds: 1,
      repos: repos.slice(0, 50),
    };
    expect(requests()).toEqual([['PROJ-131', body]]);
    expect(requestViolations('unblockStory', body)).toEqual([]);
  });

  it('can leave repository selection to the API when the story has no child aliases', async () => {
    state = {};
    await open();
    await prepare();
    expect(text(dialog())).toContain('No repository aliases recorded');
    button(dialog(), 'Unblock').click();
    await flush();
    expect(requests()).toEqual([
      ['PROJ-131', { expectedVersion: 73, reason: REASON, rounds: 1 }],
    ]);
  });

  it('sends just once for duplicate clicks, staying busy until the response and refresh finish', async () => {
    let release: (result: ApiResult<Story>) => void = () => undefined;
    answers = [
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    ];
    await open();
    await prepare();
    const confirm = button(dialog(), 'Unblock');
    let finishRefresh: () => void = () => undefined;
    api.on(
      'getStoryState',
      (key) =>
        new Promise((resolve) => {
          finishRefresh = () => resolve(ok({ key, version: 74, state }));
        })
    );
    confirm.click();
    confirm.click();
    await flush();
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    expect(text(confirm)).toContain('Unblocking');
    expect(requests()).toHaveLength(1);
    release(
      ok({ ...story, phase: 'implementation', status: 'ready', version: 74 })
    );
    await flush();
    expect(hasDialog()).toBe(true);
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    confirm.click();
    finishRefresh();
    await flush();
    expect(requests()).toHaveLength(1);
    expect(hasDialog()).toBe(false);
  });

  it.each(['stale_version', 'invalid_state'])(
    'refreshes after 409 %s, preserves entries and requires review before retrying with the new version',
    async (code) => {
      answers = [
        () => {
          story = { ...story, version: 74 };
          return conflict(code);
        },
      ];
      await open();
      await prepare();
      type('input[type=number]', '2');
      selectRepos(['backend']);
      await flush();
      button(dialog(), 'Unblock').click();
      await flush();
      expect(api.callsOf('getStory')).toHaveLength(2);
      expect(api.callsOf('listStoryEvents')).toHaveLength(2);
      expect(text(dialog())).toContain(
        'Review the refreshed voyage before retrying'
      );
      expect(text(dialog())).toContain('Version: 74');
      expect(dialog().querySelector('textarea')?.value).toBe(REASON);
      expect(
        dialog().querySelector<HTMLInputElement>('input[type=number]')?.value
      ).toBe('2');
      expect(
        [...dialog().querySelectorAll('option')]
          .filter((option) => option.selected)
          .map((option) => text(option))
      ).toEqual(['backend']);
      expect(
        dialog().querySelector<HTMLInputElement>('input[type=checkbox]')
          ?.checked
      ).toBe(false);
      expect(button(dialog(), 'Unblock').disabled).toBe(true);
      expect(requests()).toHaveLength(1);
      tick();
      await flush();
      button(dialog(), 'Unblock').click();
      await flush();
      expect(requests()).toEqual([
        [
          'PROJ-131',
          {
            expectedVersion: 73,
            reason: REASON,
            rounds: 2,
            repos: ['backend'],
          },
        ],
        [
          'PROJ-131',
          {
            expectedVersion: 74,
            reason: REASON,
            rounds: 2,
            repos: ['backend'],
          },
        ],
      ]);
      expect(hasDialog()).toBe(false);
    }
  );

  it('cannot retry when the refreshed voyage is no longer blocked', async () => {
    answers = [
      () => {
        story = {
          ...story,
          phase: 'implementation',
          status: 'ready',
          version: 74,
        };
        return conflict();
      },
    ];
    await open();
    await prepare();
    button(dialog(), 'Unblock').click();
    await flush();
    expect(text(dialog())).toContain('This voyage is no longer blocked');
    tick();
    await flush();
    expect(button(dialog(), 'Unblock').disabled).toBe(true);
    expect(requests()).toHaveLength(1);
  });

  it('asks to review a selection whose repository alias disappeared on refresh', async () => {
    answers = [
      () => {
        story = { ...story, version: 74 };
        state = { child_repos: [{ repo: 'backend' }] };
        return conflict();
      },
    ];
    await open();
    await prepare();
    selectRepos(['frontend']);
    await flush();
    button(dialog(), 'Unblock').click();
    await flush();
    tick();
    await flush();
    expect(text(dialog())).toContain(
      'The repository list changed. Review your selection.'
    );
    expect(button(dialog(), 'Unblock').disabled).toBe(true);
    selectRepos(['backend']);
    await flush();
    expect(button(dialog(), 'Unblock').disabled).toBe(false);
  });

  it('surfaces a failed conflict refresh and prevents retrying with the old version', async () => {
    answers = [
      () => {
        api.on('getStory', () => Promise.resolve(fail({ kind: 'network' })));
        return conflict();
      },
    ];
    await open();
    await prepare();
    button(dialog(), 'Unblock').click();
    await flush();
    expect(text(dialog())).toContain("Can't reach Ahoy");
    tick();
    await flush();
    expect(button(dialog(), 'Unblock').disabled).toBe(true);
    api.on('getStory', () => Promise.resolve(ok({ ...story, version: 74 })));
    button(dialog(), 'Try again').click();
    await flush();
    expect(
      dialog().querySelector<HTMLInputElement>('input[type=checkbox]')?.checked
    ).toBe(false);
    expect(requests()).toHaveLength(1);
  });

  it.each([
    [{ kind: 'network' }, "Can't reach Ahoy"],
    [
      { kind: 'problem', status: 403, code: 'forbidden', title: 'Forbidden' },
      "You can't do that",
    ],
    [
      {
        kind: 'problem',
        status: 422,
        code: 'cannot_unblock',
        title: 'Cannot unblock',
        detail: 'A human gate rejected this voyage.',
      },
      'A human gate rejected this voyage.',
    ],
  ] satisfies readonly (readonly [ApiError, string])[])(
    'shows API errors without closing, losing the reason or claiming success (%j)',
    async (error, message) => {
      answers = [() => Promise.resolve(fail(error))];
      await open();
      await prepare();
      button(dialog(), 'Unblock').click();
      await flush();
      expect(hasDialog()).toBe(true);
      expect(text(dialog())).toContain(message);
      expect(dialog().querySelector('textarea')?.value).toBe(REASON);
      expect(api.callsOf('getStory')).toHaveLength(1);
      expect(requests()).toHaveLength(1);
    }
  );

  it('shows server validation errors beside the matching fields', async () => {
    answers = [
      () =>
        Promise.resolve(
          fail({
            kind: 'problem',
            status: 400,
            code: 'validation_failed',
            title: 'Validation failed',
            errors: [
              { path: 'body/reason', message: 'Give a more specific reason.' },
              { path: 'body/rounds', message: 'Too many rounds.' },
              { path: 'body/repos', message: 'Repository is not available.' },
            ],
          })
        ),
    ];
    await open();
    await prepare();
    button(dialog(), 'Unblock').click();
    await flush();
    for (const message of [
      'Give a more specific reason.',
      'Too many rounds.',
      'Repository is not available.',
    ])
      expect(text(dialog())).toContain(message);
    expect(hasDialog()).toBe(true);
    expect(requests()).toHaveLength(1);
  });
});
