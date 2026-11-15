import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ok } from '@core/api/api-error';
import type { DecisionRequest, Story } from '@core/api/types';
import { aStory } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { VoyageContext } from '../../context/voyage-context';
import { DeliveryDecision } from './delivery-decision';

describe('DeliveryDecision', () => {
  let api: FakeApi;
  let story: Story;
  let fixture: ComponentFixture<DeliveryDecision>;

  function setUp(changes: Partial<Story>): void {
    story = aStory('PROJ-123', {
      phase: 'delivery_gate',
      status: 'awaiting_decision',
      version: 23,
      budgetNanoAiu: 30_000_000_000,
      spentNanoAiu: 21_900_000_000,
      ...changes,
    });
    api = new FakeApi();
    const net = new FakeFetch();
    net.stream();
    api
      .on('getStory', () => Promise.resolve(ok(story)))
      .on('getStoryState', (key) =>
        Promise.resolve(
          ok({
            key,
            version: story.version,
            state: {
              child_repos: [
                {
                  repo: 'billing-api',
                  pr_url: 'https://github.example.com/acme/billing-api/pull/7',
                  pr_number: 7,
                  pr_state: 'OPEN',
                },
              ],
            },
          })
        )
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
      .on('decideHumanGate', (_key, body: DecisionRequest) => {
        story = {
          ...story,
          phase: 'done',
          status: 'terminal',
          version: story.version + 1,
        };
        return Promise.resolve(
          ok({
            story,
            record: {
              id: 'r1',
              source: 'human' as const,
              gate: body.gate,
              phase: 'delivery_gate' as const,
              outcome: body.decision,
              message: null,
              actor: 'alex@example.com',
              runId: null,
              createdAt: '2026-10-08T15:00:00.000Z',
            },
          })
        );
      });
    TestBed.configureTestingModule({
      providers: [
        ...provideFakes({ api, clock: new FakeClock(), net }),
        provideRouter([]),
        VoyageContext,
      ],
    });
  }

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
    fixture = TestBed.createComponent(DeliveryDecision);
    await flush();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (root: Element | null): string =>
    (root?.textContent ?? '').replace(/\s+/g, ' ').trim();

  function card(root: Element, title: string): HTMLInputElement {
    const label = [...root.querySelectorAll('label.ah-choice')].find((l) =>
      text(l).startsWith(title)
    );
    const input = label?.querySelector('input');
    if (input === null || input === undefined)
      throw new Error(`No card ${title}`);
    return input;
  }

  function submit(root: Element): HTMLButtonElement {
    const found = root.querySelector<HTMLButtonElement>('.decision__submit');
    if (found === null) throw new Error('No submit button');
    return found;
  }

  it('asks to accept the delivery in its own words, with the pull requests to review', async () => {
    setUp({});
    const root = await render();
    expect(text(root.querySelector('.ah-panel__title'))).toBe(
      'Accept the delivery?'
    );
    expect(text(root)).toContain('delivery_accepted');
    expect(text(root.querySelector('.decision__prs'))).toBe(
      'Review before deciding: billing-api #7 open'
    );
    expect(root.querySelector('.decision__prs a')?.getAttribute('href')).toBe(
      'https://github.example.com/acme/billing-api/pull/7'
    );
    const cards = [...root.querySelectorAll('label.ah-choice')].map((l) =>
      text(l)
    );
    expect(cards[0]).toBe(
      'ApproveThe voyage is done. Its pull requests stay open for you to merge.'
    );
    expect(cards[1]).toContain(
      'Implementer reworks the pull requests, then the Lookout reviews them again.'
    );
    expect(cards.join(' ')).not.toContain('plan');
    expect(text(root)).not.toContain('arrives in a later phase');
  });

  it('names each button after the delivery: Accept delivery, Send back to Implementer, Reject delivery', async () => {
    setUp({});
    const root = await render();
    expect(text(submit(root))).toBe('Choose a decision');
    const labels: string[] = [];
    for (const title of ['Approve', 'Send back', 'Reject']) {
      card(root, title).click();
      await flush();
      labels.push(text(submit(root)));
    }
    expect(labels).toEqual([
      'Accept delivery',
      'Send back to Implementer',
      'Reject delivery',
    ]);
  });

  it('accepts the delivery at its gate with the version seen', async () => {
    setUp({});
    const root = await render();
    card(root, 'Approve').click();
    await flush();
    submit(root).click();
    await flush();
    expect(api.callsOf('decideHumanGate').map((c) => c.args)).toEqual([
      [
        'PROJ-123',
        { gate: 'delivery_accepted', decision: 'approve', expectedVersion: 23 },
      ],
    ]);
  });

  it('shows nothing at the plan gate, whose decision stays in the Plan tab, nor without an open gate', async () => {
    setUp({ phase: 'plan_review' });
    expect(text(await render())).toBe('');
    TestBed.resetTestingModule();
    setUp({ phase: 'implementation', status: 'running' });
    expect(text(await render())).toBe('');
  });
});
