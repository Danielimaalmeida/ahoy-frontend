import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import { buttonNamed, choose, field, problem, text, type } from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import getPeopleSettings from '@testing/fixtures/getPeopleSettings.json';
import listPeopleSettingsEvents from '@testing/fixtures/listPeopleSettingsEvents.json';
import putPerson from '@testing/fixtures/putPerson.json';
import removePerson from '@testing/fixtures/removePerson.json';
import updateMeetingSettings from '@testing/fixtures/updateMeetingSettings.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PeopleSettingsPage } from './people-settings-page';

const BASE = '/api/v1';

describe('the People section of Team settings', () => {
  let fixture: ComponentFixture<PeopleSettingsPage>;
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
    http.expectOne({ method: 'GET', url: `${BASE}/settings/people` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  async function answer(
    page: object = getPeopleSettings,
    history: object = listPeopleSettingsEvents
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

  /** Each row of a table, its cells joined with " | ". */
  const rows = (label: string) =>
    [...root.querySelectorAll(`[aria-label="${label}"] tbody tr`)].map((tr) =>
      [...tr.children].map((cell) => text(cell)).join(' | ')
    );
  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.text);
  const changes = (method: 'PUT' | 'DELETE', qnumber: string) =>
    http.match({ method, url: `${BASE}/settings/people/${qnumber}` });

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PeopleSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    // The names of the two sides of a meeting (Team settings › Meetings): Northwind and Contoso.
    http
      .expectOne({ method: 'GET', url: `${BASE}/settings/meetings` })
      .flush(updateMeetingSettings);
    await settle();
  });

  afterEach(() => {
    http.verify();
  });

  it('lists the members and, read-only, the deployment’s people, with the section’s history', async () => {
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('people');
    settingsRead().flush(getPeopleSettings);
    history.flush(listPeopleSettingsEvents);
    await settle();
    expect(rows('People added in Ahoy')).toEqual([
      expect.stringMatching(
        /^Bea Example q200001 \| Admin \| Northwind \| Alex Example .+ \| Make member Move to Contoso Remove$/
      ),
    ]);
    expect(rows('People set by the deployment')).toEqual([
      'Alex Example q100001You | Admin | Northwind',
      'q100002 | Member | Northwind',
    ]);
    expect(
      [...root.querySelectorAll('[aria-label="Changes to People"] li')].map(
        (li) => text(li.querySelector('.history__text span'))
      )
    ).toEqual(['q200001: Member → Admin', 'Added q200001 as member']);
  });

  it('adds a qnumber with its role and side of a meeting, lower-cased', async () => {
    await answer();
    expect(
      [...field<HTMLSelectElement>(root, 'Side in meetings').options].map((o) =>
        text(o)
      )
    ).toEqual(['Northwind', 'Contoso']);
    type(field(root, 'Qnumber'), ' Q300001 ');
    choose(field<HTMLSelectElement>(root, 'Role'), 'member');
    choose(field<HTMLSelectElement>(root, 'Side in meetings'), 'them');
    await settle();
    buttonNamed(root, 'Add').click();
    await settle();
    const [put] = changes('PUT', 'q300001');
    expect(put?.request.body).toEqual({ role: 'member', side: 'them' });
    expect(requestViolations('putPerson', put?.request.body)).toEqual([]);
    await respond(put!, putPerson);
    await answer(putPerson);
    expect(toasts()).toContain('q300001 added (Contoso).');
    expect(field(root, 'Qnumber').value).toBe('');
    expect(field<HTMLSelectElement>(root, 'Side in meetings').value).toBe('us');
    expect(rows('People added in Ahoy')[1]).toMatch(
      /^q300001 \| Member \| Contoso \| .+ \| Make admin Move to Northwind Remove$/
    );
  });

  it('moves a member to the other side of a meeting, keeping their role', async () => {
    await answer();
    buttonNamed(root, 'Move q200001 to Contoso').click();
    await settle();
    const [put] = changes('PUT', 'q200001');
    expect(put?.request.body).toEqual({ role: 'admin', side: 'them' });
    expect(requestViolations('putPerson', put?.request.body)).toEqual([]);
    await respond(put!, getPeopleSettings);
    await answer();
    expect(toasts()).toContain('q200001 moved to Contoso.');
  });

  it('refuses what is not a qnumber, or someone already listed, before sending anything', async () => {
    await answer();
    for (const [typed, says] of [
      ['alex@example.com', 'A qnumber is q then letters or digits'],
      ['q100002', 'The deployment already lets them in.'],
      ['Q200001', 'Already added'],
    ] as const) {
      type(field(root, 'Qnumber'), typed);
      await settle();
      expect(text(root)).toContain(says);
      expect(buttonNamed(root, 'Add').disabled).toBe(true);
    }
    expect(http.match((r) => r.method === 'PUT')).toEqual([]);
  });

  it('makes an admin a member, and removes someone only after a second click', async () => {
    await answer();
    buttonNamed(root, 'Make a member: q200001').click();
    await settle();
    const [put] = changes('PUT', 'q200001');
    expect(put?.request.body).toEqual({ role: 'member' });
    await respond(put!, getPeopleSettings);
    await answer();
    expect(toasts()).toContain('q200001 is now a member.');

    buttonNamed(root, 'Remove q200001').click();
    await settle();
    expect(changes('DELETE', 'q200001')).toEqual([]);
    buttonNamed(root, 'Remove q200001').click();
    await settle();
    const [removal] = changes('DELETE', 'q200001');
    await respond(removal!, removePerson);
    await answer(removePerson);
    expect(toasts()).toContain('q200001 removed.');
    expect(text(root)).toContain('Nobody added yet');
  });

  it('says why the API refused a change', async () => {
    await answer();
    buttonNamed(root, 'Make a member: q200001').click();
    await settle();
    await respond(changes('PUT', 'q200001')[0]!, problem('invalid_state'), 409);
    await answer();
    expect(root.querySelector('ah-banner')).not.toBeNull();
  });

  it('shows no controls to a member, and their own row cannot be changed', async () => {
    await answer({
      ...putPerson,
      canEdit: false,
    });
    expect(text(root)).toContain('Only admins change these');
    expect(root.querySelector('input')).toBeNull();
    expect(
      root.querySelectorAll('[aria-label="People added in Ahoy"] button')
    ).toHaveLength(0);
  });

  it('keeps an admin off their own row', async () => {
    await answer({ ...getPeopleSettings, you: 'q200001' });
    expect(rows('People added in Ahoy')[0]).toContain(
      'Another admin changes your row'
    );
    expect(
      root.querySelectorAll('[aria-label="People added in Ahoy"] button')
    ).toHaveLength(0);
  });
});
