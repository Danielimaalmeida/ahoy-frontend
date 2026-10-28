import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import addCrewMember from '@testing/fixtures/addCrewMember.json';
import addCrewTimeOff from '@testing/fixtures/addCrewTimeOff.json';
import getCrew from '@testing/fixtures/getCrew.json';
import { requestViolations } from '@testing/fixtures/contract';
import problems from '@testing/fixtures/problems.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CrewPage } from './crew-page';

const BASE = '/api/v1';
const ALEX = getCrew.members[0]!.id;
const BEA = getCrew.members[1]!.id;

/** The text of an element, whitespace collapsed. */
function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The button whose text or accessible name is `label`. */
function buttonNamed(container: Element, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (b) => text(b) === label || b.getAttribute('aria-label') === label
  );
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
}

/** The open dialog (the CDK puts it in an overlay under `body`). */
function dialog(): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    '.cdk-overlay-container .ah-dialog'
  );
  if (element === null) throw new Error('no dialog open');
  return element;
}

/** The control of the field labelled `label` in `container`. */
function field<T extends HTMLElement>(container: Element, label: string): T {
  const found = [...container.querySelectorAll('label')].find((l) =>
    text(l).startsWith(label)
  );
  const id = found?.getAttribute('for');
  const control = id ? container.querySelector<T>(`#${id}`) : null;
  if (control === null) throw new Error(`no field labelled ${label}`);
  return control;
}

function type(control: HTMLInputElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event('input'));
}

describe('the Crew page', () => {
  let fixture: ComponentFixture<CrewPage>;
  let http: HttpTestingController;
  let root: HTMLElement;

  /** Lets the answer, the promises after it and the next render finish. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  /** Answers the pending read of the crew with `crew`. */
  async function answerCrew(crew: object = getCrew): Promise<void> {
    http.expectOne({ method: 'GET', url: `${BASE}/crew` }).flush(crew);
    await settle();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CrewPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    document
      .querySelectorAll('.cdk-overlay-container')
      .forEach((c) => (c.innerHTML = ''));
    http.verify();
  });

  it('shows who is on duty this sprint and who is next, for both roles', async () => {
    expect(
      root.querySelector('[aria-label="Loading the crew"]')
    ).not.toBeNull();
    await answerCrew();
    const [sprint, lunch] = [...root.querySelectorAll('article')];
    expect(text(sprint)).toContain('Sprint person');
    expect(text(sprint)).toContain('Alex Example');
    expect(text(sprint)).toContain('Bea Example · Sprint 43 from Mon 2 Nov');
    expect(text(lunch)).toContain('Chris Example');
    expect(text(sprint)).toContain(
      'On since Mon 19 Oct · in alphabetical order'
    );
    expect(text(sprint)).toContain('ReleaseFri 30 Oct');
    expect(text(lunch)).toContain('On since Mon 19 Oct · in for Bea Example');
    expect(text(lunch)).not.toContain('Release');
    expect(text(root.querySelector('.when'))).toContain('PROJ Sprint 42');
    expect(text(root.querySelector('.when'))).toContain('day 7 of 10');
  });

  it('lists the upcoming sprints with their changes, who is away and who could step in', async () => {
    await answerCrew();
    const rows = [...root.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain('Now');
    expect(text(rows[0]?.querySelector('th'))).toContain('42');
    expect(text(rows[0])).toContain('Override');
    expect(text(rows[0])).toContain(
      'Bea Example · Bea is at a conference · Bea Example goes next'
    );
    expect(rows[0]?.querySelector('s')?.textContent).toBe('Bea Example');
    expect(text(rows[1])).toContain('Projected');
    expect(text(rows[1])).toContain('Check');
    expect(text(rows[1])).toContain(
      'Bea Example is away 9 – 13 Nov · Alex Example could step in'
    );
    expect(text(rows[1])).toContain('Nobody');
  });

  it('colours the sprint person blue and the lunch host orange, on the cards, the tags and the roster', async () => {
    await answerCrew();
    const [sprint, lunch] = [...root.querySelectorAll('article')];
    expect(sprint?.querySelector('.avatar--large')?.classList).toContain(
      'avatar--sprint_person'
    );
    expect(lunch?.querySelector('.avatar--large')?.classList).toContain(
      'avatar--lunch_host'
    );
    expect(sprint?.querySelector('.ah-tag')?.classList).toContain('tag-sprint');
    expect(lunch?.querySelector('.ah-tag')?.classList).toContain('tag-lunch');
    const avatars = [...root.querySelectorAll('.roster .member .avatar')];
    expect(
      avatars.map((a) => [...a.classList].filter((c) => c !== 'avatar'))
    ).toEqual([['avatar--sprint_person'], [], ['avatar--lunch_host']]);
    const chrisTags = [
      ...root.querySelectorAll('.roster li:nth-child(3) .ah-tag'),
    ];
    expect(chrisTags.map((t) => t.classList.contains('tag-lunch'))).toEqual([
      true,
    ]);
  });

  it("gives the lunch host's next turn with the day of the lunch, the sprint's last working day", async () => {
    const [current, next] = getCrew.sprints;
    const lunch = current!.assignments[1]!;
    await answerCrew({
      ...getCrew,
      sprints: [
        current,
        {
          ...next,
          assignments: [...next!.assignments, { ...lunch, change: null }],
        },
      ],
    });
    const [, card] = [...root.querySelectorAll('article')];
    expect(text(card?.querySelector('.next'))).toContain(
      'Chris Example · Sprint 43, lunch Fri 13 Nov'
    );
  });

  it('copies who is on this sprint and next for Teams', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t: string) => (written.push(t), Promise.resolve()) },
    });
    try {
      await answerCrew();
      buttonNamed(root, 'Copy for Teams').click();
      await settle();
      expect(written[0]?.split('\n').slice(0, 3)).toEqual([
        'Crew · PROJ Sprint 42 (19 Oct – 1 Nov)',
        '🚀 Sprint person: Alex Example · release Fri 30 Oct',
        '🍕 Lunch & retro host: Chris Example (in for Bea Example) · lunch Fri 30 Oct',
      ]);
      expect(written[0]).toContain(
        '• Sprint 43 (2 – 15 Nov): 🚀 Bea Example (away part of it)'
      );
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('lists the crew alphabetically with their time off to come', async () => {
    await answerCrew();
    const lines = [...root.querySelectorAll('.roster .member__name')].map(text);
    expect(lines).toEqual([
      'Alex Example',
      'Bea ExampleAway 9 – 13 Nov',
      'Chris Example',
    ]);
  });

  it('says how to set up the sprints when Jira is not configured', async () => {
    await answerCrew({ ...getCrew, jiraConfigured: false, sprints: [] });
    expect(text(root)).toContain('No sprints yet');
    expect(text(root)).toContain('JIRA_BOARD_ID');
  });

  it('invites to add the team when the crew is empty', async () => {
    await answerCrew({ ...getCrew, members: [], sprints: [] });
    expect(text(root)).toContain('No crew yet');
  });

  it('keeps the last sprints and says why when Jira could not be read now', async () => {
    await answerCrew({ ...getCrew, sprintsProblem: 'Jira answered 503.' });
    expect(text(root)).toContain('Showing the sprints last read from Jira');
    expect(text(root)).toContain('Jira answered 503.');
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('says why the crew could not be read and reads it again on Try again', async () => {
    const unavailable = problems.find((p) => p.code === 'unavailable')!;
    http
      .expectOne(`${BASE}/crew`)
      .flush(unavailable, { status: 503, statusText: 'Service Unavailable' });
    await settle();
    expect(root.querySelector('ah-banner')).not.toBeNull();
    buttonNamed(root, 'Try again').click();
    await answerCrew();
    expect(root.querySelector('ah-banner')).toBeNull();
    expect(root.querySelectorAll('article')).toHaveLength(2);
  });

  it('undoes a change with DELETE and reads the crew again', async () => {
    await answerCrew();
    buttonNamed(
      root,
      'Undo the change of lunch & retro host for PROJ Sprint 42'
    ).click();
    const undo = http.expectOne(`${BASE}/crew/sprints/2026-10-19/lunch_host`);
    expect(undo.request.method).toBe('DELETE');
    undo.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    await answerCrew();
  });

  it('swaps the sprint person for someone who is around, with a reason, through the change dialog', async () => {
    await answerCrew();
    buttonNamed(root, 'Change Sprint 43').click();
    await settle();
    const open = dialog();
    expect(text(open)).toContain('Bea Example is away part of this sprint');
    const alex = [...open.querySelectorAll('label.choice')].find((l) =>
      text(l).startsWith('Alex Example')
    );
    expect(text(alex)).toContain('Next who is around');
    expect(alex?.querySelector('input')?.checked).toBe(true);
    expect(text(open)).toContain("What happens to Bea Example's turn?");
    type(field<HTMLInputElement>(open, 'Reason'), 'On holiday');
    buttonNamed(open, 'Save change').click();
    const change = http.expectOne(
      `${BASE}/crew/sprints/2026-11-02/sprint_person`
    );
    expect(change.request.method).toBe('PUT');
    expect(change.request.body).toEqual({
      memberId: ALEX,
      mode: 'swap',
      reason: 'On holiday',
    });
    expect(requestViolations('changeCrewSprint', change.request.body)).toEqual(
      []
    );
    change.flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    await answerCrew();
    expect(
      document.querySelector('.cdk-overlay-container .ah-dialog')
    ).toBeNull();
  });

  it('adds a person with the turns they take', async () => {
    await answerCrew();
    buttonNamed(root, 'Add person').click();
    await settle();
    const open = dialog();
    type(field<HTMLInputElement>(open, 'Name'), '  Chris   Example ');
    const sprintPerson = [
      ...open.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ][0]!;
    sprintPerson.click();
    await settle();
    buttonNamed(open, 'Add').click();
    const add = http.expectOne({ method: 'POST', url: `${BASE}/crew/members` });
    expect(add.request.body).toEqual({
      name: 'Chris Example',
      roles: ['lunch_host'],
    });
    expect(requestViolations('addCrewMember', add.request.body)).toEqual([]);
    add.flush(addCrewMember, { status: 201, statusText: 'Created' });
    await settle();
    await answerCrew();
  });

  it('records time off for a member, leaving out an empty note', async () => {
    await answerCrew();
    buttonNamed(root, 'Add time off').click();
    await settle();
    const open = dialog();
    const who = field<HTMLSelectElement>(open, 'Who');
    who.value = BEA;
    who.dispatchEvent(new Event('change'));
    type(field<HTMLInputElement>(open, 'First day'), '2026-11-09');
    type(field<HTMLInputElement>(open, 'Last day'), '2026-11-13');
    buttonNamed(open, 'Add time off').click();
    const add = http.expectOne({
      method: 'POST',
      url: `${BASE}/crew/members/${BEA}/time-off`,
    });
    expect(add.request.body).toEqual({
      startsOn: '2026-11-09',
      endsOn: '2026-11-13',
    });
    add.flush(addCrewTimeOff, { status: 201, statusText: 'Created' });
    await settle();
    await answerCrew();
  });

  it('refuses a time off that ends before it starts, without asking the API', async () => {
    await answerCrew();
    buttonNamed(root, 'Add time off').click();
    await settle();
    const open = dialog();
    type(field<HTMLInputElement>(open, 'First day'), '2026-11-13');
    type(field<HTMLInputElement>(open, 'Last day'), '2026-11-09');
    buttonNamed(open, 'Add time off').click();
    await settle();
    expect(text(open)).toContain('The last day is before the first.');
    http.expectNone(`${BASE}/crew/members/${ALEX}/time-off`);
  });

  it("asks which turn to change from a row of Upcoming, and shows that turn's people", async () => {
    await answerCrew();
    buttonNamed(root, 'Change PROJ Sprint 42').click();
    await settle();
    const open = dialog();
    expect(text(open)).toContain('Which turn?');
    expect(text(open.querySelector('h2'))).toBe('Who is the sprint person?');
    const lunch = [...open.querySelectorAll('.roles label')].find((l) =>
      text(l).startsWith('Lunch')
    );
    lunch!.querySelector('input')!.click();
    await settle();
    expect(text(open.querySelector('h2'))).toBe(
      'Who hosts lunch and the retro?'
    );
    const people = [
      ...open.querySelectorAll('.roles + fieldset label.choice'),
    ].map((l) => text(l.querySelector('.choice__name')));
    expect(people).toEqual(['Alex Example', 'Bea Example', 'Chris Example']);
    const chris = [
      ...open.querySelectorAll<HTMLLabelElement>('label.choice'),
    ].find((l) => text(l).startsWith('Chris Example'));
    expect(chris?.querySelector('input')?.checked).toBe(true);
    expect(
      open.querySelector<HTMLInputElement>('input[formcontrolname="reason"]')
        ?.value
    ).toBe('Bea is at a conference');
  });

  it('keeps the dialog open with the reason when the API refuses the change', async () => {
    await answerCrew();
    buttonNamed(root, 'Change the sprint person this sprint').click();
    await settle();
    const open = dialog();
    const bea = [
      ...open.querySelectorAll<HTMLLabelElement>('label.choice'),
    ].find((l) => text(l).startsWith('Bea Example'));
    bea!.querySelector('input')!.click();
    await settle();
    buttonNamed(open, 'Save change').click();
    const invalid = problems.find((p) => p.code === 'invalid_state')!;
    http
      .expectOne(`${BASE}/crew/sprints/2026-10-19/sprint_person`)
      .flush(invalid, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(dialog().querySelector('ah-banner')).not.toBeNull();
  });
});
