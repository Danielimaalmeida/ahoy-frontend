import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import {
  buttonNamed,
  buttonsNamed,
  choose,
  dialog,
  field,
  openDialog,
  problem,
  removeOverlays,
  text,
  type,
} from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import getAgentSettings from '@testing/fixtures/getAgentSettings.json';
import listAgentSettingsEvents from '@testing/fixtures/listAgentSettingsEvents.json';
import updateAgentSettings from '@testing/fixtures/updateAgentSettings.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentSettingsPage } from './agent-settings-page';

const BASE = '/api/v1';
const AGENTS = getAgentSettings.agents;

describe('the Agents section of Team settings', () => {
  let fixture: ComponentFixture<AgentSettingsPage>;
  let http: HttpTestingController;
  let root: HTMLElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const settingsRead = () =>
    http.expectOne({ method: 'GET', url: `${BASE}/settings/agents` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  async function answer(
    page: object = getAgentSettings,
    history: object = listAgentSettingsEvents
  ): Promise<void> {
    settingsRead().flush(page);
    historyRead().flush(history);
    await settle();
  }

  async function respond(
    request: TestRequest,
    body: object | null,
    status = 200
  ): Promise<void> {
    if (status >= 400)
      request.flush(body, {
        status,
        statusText: 'Refused',
        headers: { 'content-type': 'application/problem+json' },
      });
    else request.flush(body, { status, statusText: 'OK' });
    await settle();
  }

  /** The profile select of the job named `name`. */
  const select = (name: string): HTMLSelectElement => {
    const found = root.querySelector<HTMLSelectElement>(
      `select[aria-label="${name} profile"]`
    );
    if (found === null) throw new Error(`no select for ${name}`);
    return found;
  };
  const options = (name: string) =>
    [...select(name).options].map((o) => text(o));
  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.text);
  const patches = () =>
    http.match({ method: 'PATCH', url: `${BASE}/settings/agents` });

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AgentSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    removeOverlays();
    http.verify();
  });

  it('lists the four jobs with their profile, offers Off only for the two that spend AIU on their own, and the history', async () => {
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('agents');
    settingsRead().flush(getAgentSettings);
    history.flush(listAgentSettingsEvents);
    await settle();

    const rows = [
      ...root.querySelectorAll('[aria-label="Agent jobs"] tbody tr'),
    ];
    expect(rows.map((r) => text(r.querySelector('th .ah-cell-sub')))).toEqual([
      'When someone asks Ahoy to refine a backlog item',
      'When a story halts and someone asks why',
      'When someone drafts a story from a meeting topic',
      'After each story that reaches done',
    ]);
    expect(select('Pre-refinement').value).toBe('story-refiner');
    expect(options('Pre-refinement')).not.toContain('Off');
    expect(options('Halt diagnosis')).not.toContain('Off');
    expect(options('Story drafts')[0]).toBe('Off');
    expect(select('Business-rule review').value).toBe('');
    expect(text(root)).toContain(
      'Profiles from the content repository at a1b2c3d.'
    );
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    expect(
      [...root.querySelectorAll('[aria-label="Changes to Agents"] li')].map(
        (li) => text(li.querySelector('.history__text span'))
      )
    ).toEqual([
      'Pre-refinement: story-refiner-v2 → story-refiner',
      'Pre-refinement: story-refiner → story-refiner-v2',
    ]);
  });

  it('saves a change of profile at once, with only what changed', async () => {
    await answer();
    choose(select('Pre-refinement'), 'story-refiner-v2');
    await settle();
    expect(text(root)).toContain('Unsaved changes');
    expect(text(root)).not.toContain('spends AIU outside a story’s budget');
    buttonNamed(root, 'Save').click();
    await settle();
    expect(openDialog()).toBeNull();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: AGENTS.version,
      refinementAgent: 'story-refiner-v2',
    });
    const saved = {
      ...getAgentSettings,
      agents: { ...AGENTS, refinementAgent: 'story-refiner-v2', version: 3 },
    };
    await respond(patch!, saved);
    await answer(saved);
    expect(toasts()).toContain("Agents' jobs saved.");
    expect(text(root)).not.toContain('Unsaved changes');
  });

  it('warns that turning a job on spends AIU, asks before saving, and sends confirmSpend', async () => {
    await answer();
    choose(select('Business-rule review'), 'knowledge-curator');
    type(field(root, 'Knowledge repository'), ' acme/business-rules ');
    await settle();
    expect(text(root)).toContain(
      'Turning on Business-rule review spends AIU outside a story’s budget'
    );
    buttonNamed(root, 'Save…').click();
    await settle();
    expect(text(dialog())).toContain('Turn on Business-rule review?');
    expect(text(dialog())).toContain(
      'A review run starts by itself each time a story reaches done'
    );
    expect(patches()).toEqual([]);

    buttonNamed(dialog(), 'Turn on and save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: AGENTS.version,
      knowledgeAgent: 'knowledge-curator',
      knowledgeRepo: 'acme/business-rules',
      confirmSpend: true,
    });
    expect(
      requestViolations('updateAgentSettings', patch?.request.body)
    ).toEqual([]);
    await respond(patch!, updateAgentSettings);
    await answer(updateAgentSettings);
    expect(toasts()).toContain("Business-rule review on. Agents' jobs saved.");
    expect(select('Business-rule review').value).toBe('knowledge-curator');
  });

  it('sends nothing when the admin cancels the spend confirmation, and keeps the draft', async () => {
    await answer();
    choose(select('Story drafts'), 'story-drafter');
    await settle();
    buttonNamed(root, 'Save…').click();
    await settle();
    expect(text(dialog())).toContain('Turn on Story drafts?');
    buttonNamed(dialog(), 'Cancel').click();
    await settle();
    expect(patches()).toEqual([]);
    expect(select('Story drafts').value).toBe('story-drafter');
    expect(text(root)).toContain('Unsaved changes');
  });

  it('turns a job off without asking, and Cancel puts the saved jobs back', async () => {
    const on = {
      ...getAgentSettings,
      agents: { ...AGENTS, storyDraftAgent: 'story-drafter' },
    };
    await answer(on);
    choose(select('Pre-refinement'), 'story-refiner-v2');
    await settle();
    buttonNamed(root, 'Cancel').click();
    await settle();
    expect(select('Pre-refinement').value).toBe('story-refiner');
    expect(text(root)).not.toContain('Unsaved changes');

    choose(select('Story drafts'), '');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    expect(openDialog()).toBeNull();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      version: AGENTS.version,
      storyDraftAgent: null,
    });
    await respond(patch!, getAgentSettings);
    await answer();
  });

  it('keeps what was saved, with its new version, when the page cannot be read again after the save', async () => {
    await answer();
    choose(select('Pre-refinement'), 'story-refiner-v2');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const saved = {
      ...getAgentSettings,
      agents: { ...AGENTS, refinementAgent: 'story-refiner-v2', version: 3 },
    };
    await respond(patches()[0]!, saved);
    settingsRead().flush(problem('internal_error'), {
      status: 500,
      statusText: 'Error',
      headers: { 'content-type': 'application/problem+json' },
    });
    historyRead().flush(listAgentSettingsEvents);
    await settle();
    expect(select('Pre-refinement').value).toBe('story-refiner-v2');
    expect(text(root)).not.toContain('Unsaved changes');

    choose(select('Halt diagnosis'), 'story-refiner');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [next] = patches();
    expect(next?.request.body).toEqual({
      version: 3,
      diagnosisAgent: 'story-refiner',
    });
    await respond(next!, saved);
    await answer(saved);
  });

  it('lets nothing else be pressed while the spend confirmation is open', async () => {
    await answer();
    choose(select('Story drafts'), 'story-drafter');
    await settle();
    buttonNamed(root, 'Save…').click();
    await settle();
    expect(buttonNamed(root, 'Save…').disabled).toBe(true);
    expect(select('Story drafts').disabled).toBe(true);
    buttonNamed(dialog(), 'Cancel').click();
    await settle();
    expect(select('Story drafts').disabled).toBe(false);
  });

  it('refuses a knowledge repository that is not owner/name before sending it', async () => {
    await answer();
    type(field(root, 'Knowledge repository'), 'https://github.com/acme/rules');
    await settle();
    expect(text(root)).toContain('Give it as owner/name');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
  });

  it('says another admin saved first, and shows their jobs instead of sending the change over them', async () => {
    await answer();
    choose(select('Halt diagnosis'), 'story-refiner');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const [patch] = patches();
    await respond(
      patch!,
      {
        ...problem('stale_version'),
        detail: 'agent settings are at version 3, not 2',
      },
      409
    );
    const theirs = {
      ...getAgentSettings,
      agents: { ...AGENTS, diagnosisAgent: 'story-refiner-v2', version: 3 },
    };
    await answer(theirs);
    expect(select('Halt diagnosis').value).toBe('story-refiner-v2');
    expect(text(root)).toContain('Someone changed this since you opened it');
    expect(text(root)).toContain('The page now shows theirs');
    expect(text(root)).not.toContain('Unsaved changes');
  });

  it('says which job is paused when its profile is gone, and marks the profile gone', async () => {
    await answer({
      ...getAgentSettings,
      agents: { ...AGENTS, knowledgeAgent: 'old-curator' },
      missing: [
        {
          job: 'knowledgeAgent',
          name: 'Business-rule review',
          profile: 'old-curator',
        },
      ],
    });
    expect(text(root)).toContain('Business-rule review is paused');
    expect(text(root)).toContain(
      'old-curator is not in the content repository at a1b2c3d any more'
    );
    expect(text(root)).toContain('or turns it off');
    expect(options('Business-rule review')).toContain('old-curator (gone)');
  });

  it('says the profiles cannot be listed when the content repository cannot be read', async () => {
    await answer({
      ...getAgentSettings,
      profiles: { commit: null, names: [], problem: 'git fetch failed' },
    });
    expect(text(root)).toContain("The content repository can't be read");
    expect(text(root)).toContain(
      'Profiles from the content repository, which cannot be read now.'
    );
    expect(options('Pre-refinement')).toEqual(['story-refiner']);
  });

  it('shows the jobs as text, without controls, to someone who is not an admin', async () => {
    await answer({ ...getAgentSettings, canEdit: false });
    expect(text(root)).toContain('Only admins change these');
    expect(root.querySelectorAll('select')).toHaveLength(0);
    expect(buttonsNamed(root, 'Save')).toEqual([]);
    const cells = [
      ...root.querySelectorAll(
        '[aria-label="Agent jobs"] tbody td:first-of-type'
      ),
    ].map((c) => text(c));
    expect(cells).toEqual(['story-refiner', 'halt-diagnoser', 'Off', 'Off']);
    expect(text(root)).toContain(
      'Knowledge repository: none (the proposals stay on the reviews)'
    );
  });
});
