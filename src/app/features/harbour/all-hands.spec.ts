import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fail, ok } from '@core/api/api-error';
import { parseAiu } from '@domain/aiu';
import type { AhoyEvent, Question, Run, Story } from '@core/api/types';
import { StoriesStore } from '@core/stores/stories-store';
import { aStory, anEvent } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch, type SseBody } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { CLOCK as UI_CLOCK } from '@ui/pipes/clock';
import { AllHandsPage } from './all-hands';

const NOW = '2026-10-06T10:10:00.000Z';
/** An AIU amount in integer nano-AIU, read as text so that no float is involved (CLAUDE.md "Numbers"). */
const aiu = (text: string): number => parseAiu(text)!;

/** The eight voyages of the wireframes (fictional), with the times of the `Main` board relative to `NOW`. */
const EIGHT: readonly Story[] = [
  aStory('PROJ-140', {
    title: 'Add audit trail to admin role changes',
    owner: 'jordan@example.com',
    phase: 'planning',
    status: 'running',
    currentRunId: 'proj-140-planning-001-5c54',
    budgetNanoAiu: aiu('30'),
    spentNanoAiu: aiu('3.2'),
    updatedAt: '2026-10-06T10:10:00.000Z',
  }),
  aStory('PROJ-109', {
    title: 'Migrate email templates to the new sender',
    owner: 'alex@example.com',
    phase: 'intake',
    status: 'ready',
    budgetNanoAiu: aiu('20'),
    spentNanoAiu: 0,
    updatedAt: '2026-10-06T10:09:00.000Z',
  }),
  aStory('PROJ-126', {
    title: 'Search orders by customer email',
    owner: 'priya@example.com',
    phase: 'intake',
    status: 'halted',
    haltReason: 'stopped_by_user',
    budgetNanoAiu: aiu('15'),
    spentNanoAiu: aiu('0.6'),
    updatedAt: '2026-10-06T10:01:00.000Z',
  }),
  aStory('PROJ-123', {
    title: 'Show invoice due date on the billing page',
    owner: 'alex@example.com',
    phase: 'plan_review',
    status: 'awaiting_decision',
    budgetNanoAiu: aiu('30'),
    spentNanoAiu: aiu('12.4'),
    updatedAt: '2026-10-06T09:48:00.000Z',
  }),
  aStory('PROJ-131', {
    title: 'Let customers download receipts as PDF',
    owner: 'sam@example.com',
    phase: 'planning',
    status: 'awaiting_input',
    budgetNanoAiu: aiu('25'),
    spentNanoAiu: aiu('6.1'),
    updatedAt: '2026-10-06T09:22:00.000Z',
  }),
  aStory('PROJ-118', {
    title: 'Rate-limit the public search endpoint',
    owner: 'sam@example.com',
    phase: 'planning',
    status: 'halted',
    haltReason: 'run_failed',
    budgetNanoAiu: aiu('20'),
    spentNanoAiu: aiu('9.8'),
    updatedAt: '2026-10-06T08:00:00.000Z',
  }),
  aStory('PROJ-097', {
    title: 'Fix the timezone in the weekly report',
    owner: 'alex@example.com',
    phase: 'done',
    status: 'terminal',
    budgetNanoAiu: aiu('40'),
    spentNanoAiu: aiu('27.1'),
    updatedAt: '2026-10-05T10:00:00.000Z',
  }),
  aStory('PROJ-102', {
    title: 'Remove the legacy coupon flow',
    owner: 'jordan@example.com',
    phase: 'blocked',
    status: 'terminal',
    budgetNanoAiu: aiu('20'),
    spentNanoAiu: aiu('8.3'),
    updatedAt: '2026-10-03T10:00:00.000Z',
  }),
];

function question(id: string, answered: boolean): Question {
  return {
    id,
    round: 1,
    runId: 'proj-131-planning-001-aaaa',
    text: `Question ${id}?`,
    recommendation: null,
    answer: answered ? 'An answer.' : null,
    answeredBy: answered ? 'sam@example.com' : null,
    answeredAt: answered ? '2026-10-06T09:30:00.000Z' : null,
    consumed: false,
  };
}

const EVENTS: Readonly<Record<string, readonly AhoyEvent[]>> = {
  'PROJ-118': [
    anEvent(
      1,
      'story.halted',
      {
        reason: 'run_failed',
        detail: 'the worker refused model gpt-5.6-terra (0 AIU)',
      },
      'PROJ-118'
    ),
  ],
  'PROJ-126': [
    anEvent(
      2,
      'story.halted',
      {
        reason: 'stopped_by_user',
        detail: 'Waiting for the Jira ticket to be split',
      },
      'PROJ-126'
    ),
  ],
  'PROJ-123': [
    anEvent(
      3,
      'story.awaiting_decision',
      { phase: 'plan_review', gate: 'plan_accepted' },
      'PROJ-123'
    ),
  ],
};

const RUN: Run = {
  id: 'proj-140-planning-001-5c54',
  storyKey: 'PROJ-140',
  phase: 'planning',
  agent: 'cartographer',
  model: 'claude-sonnet-5',
  reasoningEffort: 'high',
  status: 'running',
  runtime: 'fake',
  controlSha: 'a41f9c2bc3feeb1b5eebeaeddd73a3d21b767302',
  budgetNanoAiu: aiu('8'),
  usage: { requests: 9, nanoAiu: aiu('0.6'), inputTokens: 0, outputTokens: 0 },
  replayOf: null,
  exitReason: null,
  gate: null,
  startedBy: 'jordan@example.com',
  createdAt: '2026-10-06T10:00:00.000Z',
  startedAt: '2026-10-06T10:00:00.000Z',
  endedAt: null,
};

interface Rig {
  readonly fixture: ComponentFixture<AllHandsPage>;
  readonly root: HTMLElement;
  readonly api: FakeApi;
  readonly clock: FakeClock;
  readonly stream: SseBody;
  /** Lets the pending requests settle and renders. */
  flush(): Promise<void>;
}

/** Renders the page over fakes: `stories` answer `listStories`, and every other call answers as the wireframes' data. */
async function render(
  stories: readonly Story[] = EIGHT,
  wire: (api: FakeApi) => void = () => undefined
): Promise<Rig> {
  const clock = new FakeClock(NOW);
  const net = new FakeFetch();
  const stream = net.stream();
  const api = new FakeApi();
  api.on('listStories', () =>
    Promise.resolve(ok({ items: stories, nextCursor: null }))
  );
  api.on('listQuestions', () =>
    Promise.resolve(
      ok([question('Q1', true), question('Q2', false), question('Q3', false)])
    )
  );
  api.on('getStoryState', (key) =>
    Promise.resolve(
      ok({
        key,
        version: 9,
        state: { revisions: { plan_accepted: 1 }, revision_ceiling: 4 },
      })
    )
  );
  api.on('listStoryEvents', (key) =>
    Promise.resolve(
      ok({
        items: EVENTS[key] ?? [],
        lastEventId: EVENTS[key]?.at(-1)?.id ?? null,
      })
    )
  );
  api.on('listStoryRuns', () => Promise.resolve(ok([RUN])));
  wire(api);
  TestBed.configureTestingModule({
    providers: [
      ...provideFakes({ api, clock, net }),
      provideRouter([]),
      { provide: UI_CLOCK, useValue: () => clock.now() },
    ],
  });
  const fixture = TestBed.createComponent(AllHandsPage);
  const flush = async (): Promise<void> => {
    await settle();
    fixture.detectChanges();
    await fixture.whenStable();
    await settle();
    fixture.detectChanges();
  };
  fixture.detectChanges();
  await flush();
  return {
    fixture,
    root: fixture.nativeElement as HTMLElement,
    api,
    clock,
    stream,
    flush,
  };
}

const text = (el: Node | null | undefined): string =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The panel whose heading is `heading`. */
function panel(root: HTMLElement, heading: string): HTMLElement {
  const found = Array.from(root.querySelectorAll<HTMLElement>('section')).find(
    (section) => text(section.querySelector('h2')) === heading
  );
  if (found === undefined) throw new Error(`no panel "${heading}"`);
  return found;
}

/** A cell's text, its direct children apart: the key link and the title have only a margin between them. */
function cellText(td: Element): string {
  return Array.from(td.childNodes)
    .filter((node) => node.nodeType !== Node.COMMENT_NODE)
    .map((node) => text(node))
    .filter((part) => part !== '')
    .join(' ');
}

/** The text of every cell of every body row of a panel. */
function rowsOf(section: HTMLElement): string[][] {
  return Array.from(section.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('td')).map((td) => cellText(td))
  );
}

describe('All hands', () => {
  it('greets with the title and what the board is for', async () => {
    const { root } = await render();
    expect(text(root.querySelector('h1'))).toBe('Needs you');
    expect(text(root)).toContain(
      'Voyages waiting on a person. Anyone on the crew may answer, approve, send back or stop. Only the owner is billed.'
    );
  });

  describe('tiles', () => {
    it('count Needs answers, Needs decision and Halted (1 / 1 / 2) and link to the voyages of that status', async () => {
      const { root } = await render();
      const tiles = Array.from(
        root.querySelectorAll<HTMLAnchorElement>('a.tile')
      );
      expect(tiles.map((tile) => text(tile.querySelector('b')))).toEqual([
        '1',
        '1',
        '2',
      ]);
      expect(
        tiles.map((tile) => text(tile.querySelector('.ah-badge')))
      ).toEqual(['Needs answers', 'Needs decision', 'Halted']);
      expect(tiles.map((tile) => tile.getAttribute('href'))).toEqual([
        '/voyages?status=awaiting_input',
        '/voyages?status=awaiting_decision',
        '/voyages?status=halted',
      ]);
    });
  });

  describe('Needs you', () => {
    it('counts the voyages and says the longest wait comes first', async () => {
      const { root } = await render();
      const head = panel(root, 'Needs you').querySelector('.ah-panel__head');
      expect([
        text(head?.querySelector('h2')),
        text(head?.querySelector('.ah-muted')),
      ]).toEqual(['Needs you', '4 voyages · longest wait first']);
    });

    it('lists the voyages that wait on a person, the longest wait first', async () => {
      const { root } = await render();
      const keys = rowsOf(panel(root, 'Needs you')).map(
        (cells) => cells[1]?.split(' ')[0]
      );
      expect(keys).toEqual(['PROJ-118', 'PROJ-131', 'PROJ-123', 'PROJ-126']);
    });

    it('says what each one needs, with the small line under it', async () => {
      const { root } = await render();
      const needed = rowsOf(panel(root, 'Needs you')).map((cells) => cells[3]);
      expect(needed).toEqual([
        "A crew member's run failed, for example a refused model or a crash. run_failed · the worker refused model gpt-5.6-terra (0 AIU)",
        'Cartographer asked 3 questions Round 1 · 1 of 3 answered',
        'The plan is ready for review Gate plan_accepted · revision round 2 of 4',
        'Someone on the crew stopped it. stopped_by_user · "Waiting for the Jira ticket to be split"',
      ]);
    });

    it('shows the row as the board does: status, voyage, phase, owner, waiting and budget', async () => {
      const { root } = await render();
      const [halted, asks, orders] = rowsOf(panel(root, 'Needs you'));
      expect(halted).toEqual([
        'Halted',
        'PROJ-118 Rate-limit the public search endpoint',
        'planning',
        expect.stringContaining('run_failed'),
        'sam@example.com',
        '2 h 10 m',
        '9.8 / 20',
        'Review & resume',
      ]);
      expect([asks?.[0], asks?.[5], asks?.[6], asks?.[7]]).toEqual([
        'Needs answers',
        '48 m',
        '6.1 / 25',
        'Answer',
      ]);
      expect([
        orders?.[0],
        orders?.[2],
        orders?.[5],
        orders?.[6],
        orders?.[7],
      ]).toEqual([
        'Needs decision',
        'plan_review',
        '22 m',
        '12.4 / 30',
        'Review plan',
      ]);
    });

    it('ends each row with the action of its status, which goes to the tab that does it', async () => {
      const { root } = await render();
      const actions = Array.from(
        panel(root, 'Needs you').querySelectorAll<HTMLAnchorElement>(
          'tbody td:last-child a'
        )
      );
      expect(
        actions.map((a) => [
          text(a),
          a.getAttribute('href'),
          a.classList.contains('ah-btn--primary'),
        ])
      ).toEqual([
        ['Review & resume', '/voyages/PROJ-118/models', false],
        ['Answer', '/voyages/PROJ-131/questions', true],
        ['Review plan', '/voyages/PROJ-123/plan', true],
        ['Review & resume', '/voyages/PROJ-126/models', false],
      ]);
    });

    it('gives each action a name that says which voyage it is for', async () => {
      const { root } = await render();
      const names = Array.from(
        panel(root, 'Needs you').querySelectorAll('tbody td:last-child a')
      ).map((a) => a.getAttribute('aria-label'));
      expect(names).toEqual([
        'Review & resume PROJ-118',
        'Answer PROJ-131',
        'Review plan PROJ-123',
        'Review & resume PROJ-126',
      ]);
    });

    it('links the key to the voyage', async () => {
      const { root } = await render();
      const links = Array.from(
        panel(root, 'Needs you').querySelectorAll<HTMLAnchorElement>(
          'tbody a.ah-key'
        )
      );
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        '/voyages/PROJ-118',
        '/voyages/PROJ-131',
        '/voyages/PROJ-123',
        '/voyages/PROJ-126',
      ]);
    });

    it('still shows each voyage with a plain line while its details are not read', async () => {
      const { root } = await render(EIGHT, (api) => {
        api.on('listQuestions', () =>
          Promise.resolve(fail({ kind: 'network' }))
        );
        api.on('getStoryState', () =>
          Promise.resolve(fail({ kind: 'network' }))
        );
        api.on('listStoryEvents', () =>
          Promise.resolve(fail({ kind: 'network' }))
        );
      });
      const needed = rowsOf(panel(root, 'Needs you')).map((cells) => cells[3]);
      expect(needed).toEqual([
        "A crew member's run failed, for example a refused model or a crash. run_failed",
        'Cartographer is waiting for answers',
        'The plan is ready for review Gate plan_accepted',
        'Someone on the crew stopped it. stopped_by_user',
      ]);
    });

    it('scrolls inside a box that a keyboard can reach, and says what it holds', async () => {
      const { root } = await render();
      const box = panel(root, 'Needs you').querySelector<HTMLElement>(
        '[role=region]'
      );
      expect(box?.getAttribute('tabindex')).toBe('0');
      expect(box?.getAttribute('aria-label')).toBe('Voyages that need you');
      expect(box?.querySelector('table')).not.toBeNull();
    });
  });

  describe('In progress', () => {
    it('lists the voyages the crew is working on, the latest update first, with a link to all voyages', async () => {
      const { root } = await render();
      const sea = panel(root, 'In progress');
      expect(text(sea.querySelector('.ah-panel__head'))).toContain(
        'Agents are working; nothing needed from you'
      );
      const link = sea.querySelector<HTMLAnchorElement>('.ah-panel__head a');
      expect([text(link), link?.getAttribute('href')]).toEqual([
        'All voyages',
        '/voyages',
      ]);
      expect(rowsOf(sea).map((cells) => cells[1]?.split(' ')[0])).toEqual([
        'PROJ-140',
        'PROJ-109',
      ]);
    });

    it('names the crew member with the model and effort of its run, or who goes next', async () => {
      const { root } = await render();
      const [running, queued] = rowsOf(panel(root, 'In progress'));
      expect(running).toEqual([
        'Running',
        'PROJ-140 Add audit trail to admin role changes',
        'planning',
        'Cartographer · claude-sonnet-5 · high',
        'jordan@example.com',
        'just now',
        '3.2 / 30',
      ]);
      expect(queued).toEqual([
        'Queued',
        'PROJ-109 Migrate email templates to the new sender',
        'intake',
        'Navigator goes next',
        'alex@example.com',
        '1 m ago',
        '0.0 / 20',
      ]);
    });

    it('says there is nothing at sea when no voyage is under way or queued', async () => {
      const { root } = await render(
        EIGHT.filter(
          (story) => story.status !== 'running' && story.status !== 'ready'
        )
      );
      expect(text(panel(root, 'In progress'))).toContain('Nothing in progress');
    });
  });

  describe('Calm seas', () => {
    it('takes the place of the table when nothing needs a person, with a way to all voyages', async () => {
      const { root } = await render(
        EIGHT.filter(
          (story) =>
            !['awaiting_input', 'awaiting_decision', 'halted'].includes(
              story.status
            )
        )
      );
      const needs = panel(root, 'Needs you');
      expect(text(needs)).toContain('Calm seas');
      expect(text(needs)).toContain(
        'Nothing needs you right now. Questions, decisions and halted voyages show up here.'
      );
      expect(needs.querySelector('table')).toBeNull();
      const link = needs.querySelector<HTMLAnchorElement>('a');
      expect([text(link), link?.getAttribute('href')]).toEqual([
        'See all voyages',
        '/voyages',
      ]);
      expect(
        Array.from(root.querySelectorAll('a.tile b')).map((b) => text(b))
      ).toEqual(['0', '0', '0']);
    });
  });

  describe('while the list loads', () => {
    it('shows skeleton rows with no counts, and no empty state', async () => {
      const never = new Promise<never>(() => undefined);
      const { root } = await render(EIGHT, (api) =>
        api.on('listStories', () => never)
      );
      expect(root.querySelector('[aria-busy=true]')).not.toBeNull();
      expect(root.querySelectorAll('a.tile b')).toHaveLength(0);
      expect(root.querySelectorAll('a.tile ah-skeleton')).toHaveLength(3);
      expect(text(root)).not.toContain('Calm seas');
    });
  });

  describe('when the harbour cannot be reached', () => {
    it('says contact was lost, that nothing was lost, and tries again on request', async () => {
      let attempt = 0;
      const { root, fixture, flush } = await render(EIGHT, (api) =>
        api.on('listStories', () => {
          attempt++;
          return Promise.resolve(
            attempt === 1
              ? fail({
                  kind: 'problem',
                  status: 503,
                  code: 'unavailable',
                  title: 'Unavailable',
                  instance: 'req-7',
                })
              : ok({ items: EIGHT, nextCursor: null })
          );
        })
      );
      const banner = root.querySelector('.ah-banner');
      expect(text(banner)).toContain("Can't reach Ahoy");
      expect(text(banner)).toContain(
        'Nothing you did was lost, and no voyage stopped because of this.'
      );
      expect(text(banner)).toContain('503 · unavailable · request req-7');
      expect(text(root)).not.toContain('Calm seas');
      const retry = Array.from(root.querySelectorAll('button')).find(
        (b) => text(b) === 'Try again'
      );
      retry?.click();
      await flush();
      fixture.detectChanges();
      expect(text(root)).not.toContain("Can't reach Ahoy");
      expect(rowsOf(panel(root, 'Needs you'))).toHaveLength(4);
    });

    it('says Ahoy sent something unexpected when the answer cannot be read, which is not a verdict', async () => {
      const { root } = await render(EIGHT, (api) =>
        api.on('listStories', () =>
          Promise.resolve(
            fail({ kind: 'invalid_response', what: 'listStories: bad' })
          )
        )
      );
      expect(text(root)).toContain('Ahoy sent something unexpected');
      expect(text(root)).toContain('invalid_response');
      expect(text(root)).not.toContain("Can't reach Ahoy");
    });

    it('keeps the voyages it has when a later read fails', async () => {
      const { root, api, flush } = await render();
      api.on('listStories', () => Promise.resolve(fail({ kind: 'network' })));
      const result = await TestBed.inject(StoriesStore).loadAll();
      await flush();
      expect(result.ok).toBe(false);
      expect(rowsOf(panel(root, 'Needs you'))).toHaveLength(4);
      expect(text(root)).not.toContain("Can't reach Ahoy");
    });
  });

  describe('live', () => {
    it('moves a voyage from Needs you to In progress when the stream says it was answered, with no reload', async () => {
      const { root, api, stream, clock, flush } = await render();
      expect(
        rowsOf(panel(root, 'Needs you')).map((cells) => cells[1]?.split(' ')[0])
      ).toContain('PROJ-131');
      api.on('getStory', () =>
        Promise.resolve(
          ok(
            aStory('PROJ-131', {
              title: 'Let customers download receipts as PDF',
              owner: 'sam@example.com',
              phase: 'planning',
              status: 'running',
              version: 2,
              budgetNanoAiu: aiu('25'),
              spentNanoAiu: aiu('6.1'),
              updatedAt: '2026-10-06T10:10:30.000Z',
            })
          )
        )
      );
      stream.sendEvent(anEvent(901, 'question.answered', {}, 'PROJ-131'));
      await settle();
      await clock.advance(300);
      await flush();
      expect(
        rowsOf(panel(root, 'Needs you')).map((cells) => cells[1]?.split(' ')[0])
      ).toEqual(['PROJ-118', 'PROJ-123', 'PROJ-126']);
      expect(
        rowsOf(panel(root, 'In progress')).map(
          (cells) => cells[1]?.split(' ')[0]
        )
      ).toEqual(['PROJ-131', 'PROJ-140', 'PROJ-109']);
      expect(
        Array.from(root.querySelectorAll('a.tile b')).map((b) => text(b))
      ).toEqual(['0', '1', '2']);
      expect(api.callsOf('getStory')).toHaveLength(1);
    });

    it('updates the small line when a question is answered, with the same row', async () => {
      const { root, api, stream, clock, flush } = await render();
      api.on('listQuestions', () =>
        Promise.resolve(
          ok([
            question('Q1', true),
            question('Q2', true),
            question('Q3', false),
          ])
        )
      );
      stream.sendEvent(anEvent(902, 'question.answered', {}, 'PROJ-131'));
      await settle();
      await clock.advance(300);
      await flush();
      const asks = rowsOf(panel(root, 'Needs you')).find((cells) =>
        cells[1]?.startsWith('PROJ-131')
      );
      expect(asks?.[3]).toBe(
        'Cartographer asked 3 questions Round 1 · 2 of 3 answered'
      );
    });
  });
});
