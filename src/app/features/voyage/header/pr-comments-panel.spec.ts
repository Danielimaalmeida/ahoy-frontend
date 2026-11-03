import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fail, ok, type ApiResult } from '@core/api/api-error';
import type { PrCommentRuling, Story, StoryPrComments } from '@core/api/types';
import { aStory } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import {
  requestViolations,
  responseViolations,
} from '@testing/fixtures/contract';
import { VoyageContext } from '../context/voyage-context';
import { PrCommentsPanel } from './pr-comments-panel';

const NOTE = 'Sam is right about the PDF export.';

/** A ruling for specs; fictional data. */
function aRuling(changes: Partial<PrCommentRuling> = {}): PrCommentRuling {
  return {
    id: '1',
    repo: 'web',
    slug: 'github.example.com/acme/web-app',
    prNumber: 42,
    kind: 'conversation',
    source: 'person',
    author: 'sam',
    excerpt: 'Could we <b>also</b> show the due date on the PDF export?',
    path: null,
    line: null,
    ruling: 'declined',
    reason: 'The PDF export is outside this story.',
    severity: null,
    status: 'reply_pending',
    replyBody: '**Ahoy:** not changing this.',
    resolveThread: false,
    ruledAt: '2026-10-08T14:20:00.000Z',
    repliedAt: null,
    replyError: null,
    ...changes,
  };
}

describe('PrCommentsPanel', () => {
  let api: FakeApi;
  let story: Story;
  let comments: StoryPrComments;
  let fixture: ComponentFixture<PrCommentsPanel>;

  beforeEach(() => {
    story = aStory('PROJ-123', {
      phase: 'delivery_gate',
      status: 'awaiting_decision',
      version: 23,
      budgetNanoAiu: 30_000_000_000,
      spentNanoAiu: 21_900_000_000,
    });
    comments = {
      key: 'PROJ-123',
      count: {
        waiting: 2,
        openPrs: 1,
        checkedAt: '2026-10-08T14:25:00.000Z',
        error: null,
      },
      rulings: [],
    };
    api = new FakeApi();
    const net = new FakeFetch();
    net.stream();
    api
      .on('getStory', () => Promise.resolve(ok(story)))
      .on('getStoryState', (key) =>
        Promise.resolve(ok({ key, version: story.version, state: {} }))
      )
      .on('listStoryRuns', () => Promise.resolve(ok([])))
      .on('listQuestions', () => Promise.resolve(ok([])))
      .on('listGateRecords', () => Promise.resolve(ok([])))
      .on('getStoryModels', (key) =>
        Promise.resolve(
          ok({ storyKey: key, version: story.version, slots: [] })
        )
      )
      .on('listArtifacts', () =>
        Promise.resolve(ok({ revision: 1, items: [] }))
      )
      .on('listStoryEvents', () =>
        Promise.resolve(ok({ items: [], lastEventId: null }))
      )
      .on('getStoryPrComments', () => Promise.resolve(ok(comments)))
      .on('assessComments', (): Promise<ApiResult<Story>> => {
        story = {
          ...story,
          phase: 'pr_review',
          status: 'ready',
          version: story.version + 1,
        };
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
    fixture = TestBed.createComponent(PrCommentsPanel);
    await flush();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (root: Element | null): string =>
    (root?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const buttons = (root: Element): string[] =>
    [...root.querySelectorAll('button')].map((b) => text(b));

  function dialog(): HTMLElement {
    const found = document.querySelector<HTMLElement>(
      '.cdk-overlay-container .ah-dialog'
    );
    if (found === null) throw new Error('No dialog');
    return found;
  }

  function confirm(): HTMLButtonElement {
    const found = [...dialog().querySelectorAll('button')].find((b) =>
      text(b).startsWith('Assess comments ·')
    );
    if (found === undefined) throw new Error('No confirm button');
    return found;
  }

  it('offers Assess comments at the delivery gate with the count of people’s comments waiting', async () => {
    const root = await render();
    expect(text(root)).toContain('Pull request comments');
    expect(text(root)).toContain('2 comments to assess');
    expect(text(root)).toContain('on 1 open pull request');
    expect(buttons(root)).toContain('Assess comments');
    expect(api.callsOf('getStoryPrComments').map((c) => c.args)).toEqual([
      ['PROJ-123'],
    ]);
  });

  it('asks the reviewer with confirmSpend and the note, and reads the comments again', async () => {
    const root = await render();
    [...root.querySelectorAll('button')]
      .find((b) => text(b) === 'Assess comments')!
      .click();
    await flush();
    expect(text(dialog())).toContain('2 comments by people are waiting');
    expect(text(dialog())).toContain('This may spend up to 8.1 AIU');
    const note = dialog().querySelector('textarea')!;
    note.value = `  ${NOTE}  `;
    note.dispatchEvent(new Event('input'));
    confirm().click();
    await flush();
    const sent = api.callsOf('assessComments').map((c) => c.args);
    expect(sent).toEqual([
      ['PROJ-123', { expectedVersion: 23, note: NOTE, confirmSpend: true }],
    ]);
    expect(requestViolations('assessComments', sent[0]![1])).toEqual([]);
    expect(api.callsOf('getStoryPrComments').length).toBeGreaterThan(1);
  });

  it('sends no note when none is given', async () => {
    const root = await render();
    [...root.querySelectorAll('button')]
      .find((b) => text(b) === 'Assess comments')!
      .click();
    await flush();
    confirm().click();
    await flush();
    expect(api.callsOf('assessComments').map((c) => c.args[1])).toEqual([
      { expectedVersion: 23, confirmSpend: true },
    ]);
  });

  it('lists every ruling with its reason and reply as plain text, also while the loop is under way', async () => {
    story = { ...story, phase: 'rework', status: 'ready' };
    comments = {
      ...comments,
      count: null,
      rulings: [
        aRuling(),
        aRuling({
          id: '2',
          kind: 'thread',
          source: 'copilot',
          author: 'copilot-pull-request-reviewer',
          path: 'src/app/billing/invoice-row.ts',
          line: 18,
          excerpt: 'The due date can be null here.',
          ruling: 'accepted',
          severity: 'medium',
          reason: 'The row will show a dash.',
          status: 'awaiting_fix',
          replyBody: null,
        }),
        aRuling({ id: '3', replyError: 'HTTP 403 on the reply' }),
      ],
    };
    expect(responseViolations('getStoryPrComments', comments)).toEqual([]);
    const root = await render();
    expect(buttons(root)).not.toContain('Assess comments');
    const rows = [...root.querySelectorAll('tbody tr')].map((r) => text(r));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('sam (person) · web #42 · Conversation');
    expect(rows[0]).toContain('Declined');
    expect(rows[0]).toContain('Reply waiting to be posted');
    expect(rows[1]).toContain(
      'Copilot) · web #42 · src/app/billing/invoice-row.ts:18'
    );
    expect(rows[1]).toContain('Accepted (medium)');
    expect(rows[1]).toContain('Waits for the fix to be reviewed');
    expect(rows[2]).toContain('Reply not posted yet: GitHub refused it');
    expect(rows[2]).toContain('HTTP 403 on the reply');
    expect(root.querySelector('b b')).toBeNull();
    expect(text(root)).toContain('<b>also</b>');
  });

  it('is hidden while the voyage is under way with nothing ruled', async () => {
    story = { ...story, phase: 'implementation', status: 'running' };
    comments = { ...comments, count: null };
    const root = await render();
    expect(root.querySelector('ah-panel')).toBeNull();
  });

  it('offers nothing on a done voyage whose pull requests are all closed, and says why', async () => {
    story = { ...story, phase: 'done', status: 'terminal' };
    comments = {
      ...comments,
      count: { ...comments.count!, waiting: 0, openPrs: 0 },
    };
    const root = await render();
    expect(buttons(root)).not.toContain('Assess comments');
    expect(text(root)).toContain('a change now is a new story');
  });

  it('still offers the button when the comments cannot be read, saying so', async () => {
    api.on('getStoryPrComments', () =>
      Promise.resolve(fail({ kind: 'network' }))
    );
    const root = await render();
    expect(text(root)).toContain('Could not read the pull request comments.');
    expect(buttons(root)).toContain('Assess comments');
  });
});
