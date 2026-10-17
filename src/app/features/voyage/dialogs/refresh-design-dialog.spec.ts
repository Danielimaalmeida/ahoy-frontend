import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ok, type ApiResult } from '@core/api/api-error';
import type { ArtifactList, Story } from '@core/api/types';
import { aStory } from '@core/realtime/testing/events';
import { FakeApi } from '@core/realtime/testing/fake-api';
import { FakeClock, settle } from '@core/realtime/testing/fake-clock';
import { FakeFetch } from '@core/realtime/testing/fake-fetch';
import { provideFakes } from '@core/realtime/testing/providers';
import { requestViolations } from '@testing/fixtures/contract';
import { VoyageContext } from '../context/voyage-context';
import { VoyageHeader } from '../header/voyage-header';

const FRAME = 'https://www.figma.com/design/Fk2/Billing-v2?node-id=12-40';
const REASON = 'The designer moved the due date under the total.';

/** An artifact list entry at `path`. */
function artifact(path: string): ArtifactList['items'][number] {
  return {
    path,
    sha256: 'a'.repeat(64),
    sizeBytes: 2,
    mediaType: 'application/json',
    revision: 3,
    runId: null,
    createdAt: '2026-10-08T14:00:00.000Z',
  };
}

describe('Refresh design from the voyage header', () => {
  let api: FakeApi;
  let story: Story;
  let paths: string[];
  let fixture: ComponentFixture<VoyageHeader>;

  beforeEach(() => {
    story = aStory('PROJ-123', {
      phase: 'delivery_gate',
      status: 'awaiting_decision',
      version: 23,
      budgetNanoAiu: 30_000_000_000,
      spentNanoAiu: 21_900_000_000,
    });
    paths = ['implementation-plan.md', 'design/index.json'];
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
        Promise.resolve(ok({ revision: 3, items: paths.map(artifact) }))
      )
      .on('listStoryEvents', () =>
        Promise.resolve(ok({ items: [], lastEventId: null }))
      )
      .on('refreshDesign', (): Promise<ApiResult<Story>> => {
        story = {
          ...story,
          phase: 'design',
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
    fixture = TestBed.createComponent(VoyageHeader);
    await flush();
    return fixture.nativeElement as HTMLElement;
  }

  function text(root: Element): string {
    return (root.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function buttons(root: Element): string[] {
    return [...root.querySelectorAll('button')].map((item) => text(item));
  }

  function button(root: Element, name: string): HTMLButtonElement {
    const found = [...root.querySelectorAll('button')].find((item) =>
      text(item).startsWith(name)
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

  function type(index: number, value: string): void {
    const control = dialog().querySelectorAll('textarea')[index];
    if (control === undefined) throw new Error(`No textarea ${index}`);
    control.value = value;
    control.dispatchEvent(new Event('input'));
    control.dispatchEvent(new Event('blur'));
  }

  it('offers Refresh design at the delivery gate of a voyage with a design, and not without one', async () => {
    expect(buttons(await render())).toContain('Refresh design');
    fixture.destroy();
    paths = ['implementation-plan.md'];
    story = { ...story, key: 'PROJ-124' };
    expect(buttons(await render())).not.toContain('Refresh design');
  });

  it('sends the new links, one per line, with the trimmed reason and the version the user saw', async () => {
    button(await render(), 'Refresh design').click();
    await flush();
    expect(text(dialog())).toContain('Refresh the design of PROJ-123?');
    expect(text(dialog())).toContain('This may spend up to 8.1 AIU');
    type(0, `\n  ${FRAME}  \n`);
    type(1, `  ${REASON}\n`);
    await flush();
    button(dialog(), 'Refresh design · up to').click();
    await flush();
    const sent = api.callsOf('refreshDesign').map((call) => call.args);
    expect(sent).toEqual([
      [
        'PROJ-123',
        {
          expectedVersion: 23,
          reason: REASON,
          figmaLinks: [FRAME],
          confirmSpend: true,
        },
      ],
    ]);
    expect(requestViolations('refreshDesign', sent[0]![1])).toEqual([]);
  });

  it('says what is wrong with a link before anything is sent', async () => {
    button(await render(), 'Refresh design').click();
    await flush();
    type(0, 'https://www.figma.com/design/Fk2/Billing-v2');
    type(1, REASON);
    await flush();
    expect(text(dialog())).toContain(
      'Line 1 names no frame: copy the link to the frame, with its node-id.'
    );
    button(dialog(), 'Refresh design · up to').click();
    await flush();
    expect(api.callsOf('refreshDesign')).toEqual([]);
  });
});
