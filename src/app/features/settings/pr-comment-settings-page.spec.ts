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
import getPrCommentSettings from '@testing/fixtures/getPrCommentSettings.json';
import listPrCommentSettingsEvents from '@testing/fixtures/listPrCommentSettingsEvents.json';
import updatePrCommentSettings from '@testing/fixtures/updatePrCommentSettings.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrCommentSettingsPage } from './pr-comment-settings-page';

const BASE = '/api/v1';
const SAVED = getPrCommentSettings.prComments;

describe('the Pull request comments section of Team settings', () => {
  let fixture: ComponentFixture<PrCommentSettingsPage>;
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
    http.expectOne({ method: 'GET', url: `${BASE}/settings/pr-comments` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  async function answer(
    page: object = getPrCommentSettings,
    history: object = listPrCommentSettingsEvents
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

  const replies = () => field<HTMLSelectElement>(root, 'Replies on GitHub');
  const perRound = () => field(root, 'Comments per round');
  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.text);
  const patches = () =>
    http.match({ method: 'PATCH', url: `${BASE}/settings/pr-comments` });

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PrCommentSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    removeOverlays();
    http.verify();
  });

  it('shows replies off and ten comments a round before any save, with its own history', async () => {
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('pr_comments');
    settingsRead().flush(getPrCommentSettings);
    history.flush(listPrCommentSettingsEvents);
    await settle();
    expect(replies().value).toBe('off');
    expect(perRound().value).toBe('10');
    expect(text(root)).not.toContain('cannot post replies');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    expect(
      [
        ...root.querySelectorAll(
          '[aria-label="Changes to Pull request comments"] li'
        ),
      ].map((li) => text(li.querySelector('.history__text span')))
    ).toEqual([
      'Replies: off → on; Comments per round: 10 → 6 (confirmed replies are posted on pull requests)',
    ]);
  });

  it('saves the comments per round at once, with only what changed', async () => {
    await answer();
    type(perRound(), ' 6 ');
    await settle();
    expect(text(root)).toContain('Unsaved changes');
    buttonNamed(root, 'Save').click();
    await settle();
    expect(openDialog()).toBeNull();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({ commentsPerRound: 6 });
    expect(
      requestViolations('updatePrCommentSettings', patch?.request.body)
    ).toEqual([]);
    const saved = {
      ...getPrCommentSettings,
      prComments: { ...SAVED, commentsPerRound: 6, version: 1 },
    };
    await respond(patch!, saved);
    await answer(saved);
    expect(toasts()).toContain('Pull request comment settings saved.');
    expect(perRound().value).toBe('6');
  });

  it('refuses comments per round outside 1 to 10 before sending anything', async () => {
    await answer();
    for (const typed of ['0', '11', '2.5']) {
      type(perRound(), typed);
      await settle();
      expect(text(root)).toContain('Give a whole number from 1 to 10.');
      expect(buttonNamed(root, 'Save').disabled).toBe(true);
    }
    expect(patches()).toEqual([]);
  });

  it('asks before turning replies on, sends confirmReplies, and sends nothing when cancelled', async () => {
    await answer();
    choose(replies(), 'on');
    await settle();
    expect(text(root)).toContain(
      "Turning replies on posts on your colleagues' pull requests"
    );
    buttonNamed(root, 'Save…').click();
    await settle();
    expect(text(dialog())).toContain('Turn replies on?');
    buttonNamed(dialog(), 'Cancel').click();
    await settle();
    expect(patches()).toEqual([]);
    expect(replies().value).toBe('on');

    type(perRound(), '6');
    buttonNamed(root, 'Save…').click();
    await settle();
    buttonNamed(dialog(), 'Turn on and save').click();
    await settle();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({
      repliesOn: true,
      commentsPerRound: 6,
      confirmReplies: true,
    });
    expect(
      requestViolations('updatePrCommentSettings', patch?.request.body)
    ).toEqual([]);
    await respond(patch!, updatePrCommentSettings);
    await answer(updatePrCommentSettings);
    expect(toasts()).toContain(
      'Replies on. Pull request comment settings saved.'
    );
  });

  it('turns replies off without asking, with the version it read', async () => {
    await answer(updatePrCommentSettings);
    choose(replies(), 'off');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    expect(openDialog()).toBeNull();
    const [patch] = patches();
    expect(patch?.request.body).toEqual({ version: 1, repliesOn: false });
    await respond(patch!, getPrCommentSettings);
    await answer();
  });

  it('says another admin saved first, and shows theirs', async () => {
    await answer(updatePrCommentSettings);
    type(perRound(), '3');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const theirs = {
      ...updatePrCommentSettings,
      prComments: { ...updatePrCommentSettings.prComments, version: 2 },
    };
    await respond(patches()[0]!, problem('stale_version'), 409);
    await answer(theirs);
    expect(text(root)).toContain('Another admin saved these settings first');
    expect(perRound().value).toBe('6');
  });

  it('reads only, and says when the deployment cannot post replies', async () => {
    await answer({
      ...getPrCommentSettings,
      canEdit: false,
      repliesPostable: false,
    });
    expect(text(root)).toContain('Only admins change these');
    expect(text(root)).toContain('This deployment cannot post replies');
    expect(root.querySelector('select')).toBeNull();
    expect([...root.querySelectorAll('dd')].map((dd) => text(dd))).toEqual([
      'Off',
      '10 comments',
    ]);
  });
});
