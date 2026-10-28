import { describe, expect, it } from 'vitest';
import {
  awayLabel,
  cleanName,
  crewToTeams,
  dayLabel,
  initial,
  isDay,
  lastWorkday,
  ROLE_WORDS,
  spanLabel,
  sprintProgress,
  sprintLabels,
  sprintShortTitle,
  sprintTitle,
  timeOffDuring,
  timeOffRefusal,
  upcomingTimeOff,
} from './crew';

describe('crew words', () => {
  it('names a day by its weekday, whatever the time zone', () => {
    expect(dayLabel('2026-10-19')).toBe('Mon 19 Oct');
    expect(dayLabel('2026-11-02')).toBe('Mon 2 Nov');
    expect(dayLabel('2026-02-30')).toBe('—');
    expect(isDay('2026-10-19')).toBe(true);
    expect(isDay('19/10/2026')).toBe(false);
  });

  it('writes a sprint’s days with the month once when it does not change', () => {
    expect(spanLabel('2026-10-19', '2026-10-30')).toBe('19 – 30 Oct');
    expect(spanLabel('2026-11-30', '2026-12-11')).toBe('30 Nov – 11 Dec');
    expect(spanLabel('2026-12-28', '2027-01-08')).toBe('28 Dec – 8 Jan');
    expect(spanLabel('2026-11-16', '2026-11-16')).toBe('16 Nov');
    expect(spanLabel('nope', '2026-11-16')).toBe('—');
  });

  it('counts working days into the sprint, and nothing outside it', () => {
    expect(sprintProgress('2026-10-19', '2026-10-30', '2026-10-27')).toEqual({
      day: 7,
      of: 10,
    });
    expect(sprintProgress('2026-10-19', '2026-10-30', '2026-10-19')).toEqual({
      day: 1,
      of: 10,
    });
    expect(sprintProgress('2026-10-19', '2026-10-30', '2026-10-25')).toEqual({
      day: 5,
      of: 10,
    });
    expect(sprintProgress('2026-10-19', '2026-10-30', '2026-10-31')).toBeNull();
  });

  it('titles a projected sprint by its first day', () => {
    expect(sprintTitle({ name: 'Sprint 42', startsOn: '2026-10-19' })).toBe(
      'Sprint 42'
    );
    expect(sprintTitle({ name: null, startsOn: '2026-11-30' })).toBe(
      'Sprint of 30 Nov'
    );
  });

  it('shows time off from today on, earliest first', () => {
    const spans = [
      { startsOn: '2026-12-21', endsOn: '2027-01-04' },
      { startsOn: '2026-10-01', endsOn: '2026-10-02' },
      { startsOn: '2026-11-09', endsOn: '2026-11-20' },
    ];
    expect(upcomingTimeOff(spans, '2026-10-27').map(awayLabel)).toEqual([
      'Away 9 – 20 Nov',
      'Away 21 Dec – 4 Jan',
    ]);
  });

  it('refuses a time off that ends before it starts, is not a day or is longer than a year', () => {
    expect(timeOffRefusal('2026-11-09', '2026-11-20')).toBeNull();
    expect(timeOffRefusal('2026-11-20', '2026-11-09')).toMatch(/before/);
    expect(timeOffRefusal('', '2026-11-09')).toMatch(/Pick/);
    expect(timeOffRefusal('2026-01-01', '2027-06-01')).toMatch(/a year/);
  });

  it('cleans names, takes their initial and words each role', () => {
    expect(cleanName('  Bea   Silva ')).toBe('Bea Silva');
    expect(initial(' álvaro')).toBe('Á');
    expect(initial('')).toBe('?');
    expect(ROLE_WORDS.sprint_person.who).toBe('Devs');
    expect(ROLE_WORDS.lunch_host.name).toBe('Lunch & retro host');
  });
});

describe('sprint days', () => {
  it('releases on the last working day of the sprint, not on its weekend', () => {
    expect(lastWorkday('2026-10-19', '2026-11-01')).toBe('2026-10-30');
    expect(lastWorkday('2026-10-19', '2026-10-30')).toBe('2026-10-30');
    expect(lastWorkday('2026-10-31', '2026-11-01')).toBe('2026-11-01');
  });

  it('shortens a Jira sprint name to its number and keeps a projected sprint whole', () => {
    expect(
      sprintShortTitle({ name: 'PROJ Sprint 42', startsOn: '2026-10-19' })
    ).toBe('42');
    expect(
      sprintShortTitle({ name: 'Guardians', startsOn: '2026-10-19' })
    ).toBe('Guardians');
    expect(sprintShortTitle({ name: null, startsOn: '2026-11-30' })).toBe(
      'Sprint of 30 Nov'
    );
  });

  it('numbers projected sprints after the last one Jira named, and names them by their first day otherwise', () => {
    expect(
      sprintLabels([
        { name: 'PROJ Sprint 42', startsOn: '2026-10-19' },
        { name: 'PROJ Sprint 43', startsOn: '2026-11-02' },
        { name: null, startsOn: '2026-11-16' },
        { name: null, startsOn: '2026-11-30' },
      ])
    ).toEqual([
      { short: '42', title: 'PROJ Sprint 42' },
      { short: '43', title: 'PROJ Sprint 43' },
      { short: '44', title: 'Sprint 44' },
      { short: '45', title: 'Sprint 45' },
    ]);
    expect(
      sprintLabels([
        { name: 'Guardians', startsOn: '2026-10-19' },
        { name: null, startsOn: '2026-11-02' },
      ])
    ).toEqual([
      { short: 'Guardians', title: 'Guardians' },
      { short: 'Sprint of 2 Nov', title: 'Sprint of 2 Nov' },
    ]);
  });

  it('finds the time off that overlaps a sprint, and none that ended before or starts after', () => {
    const spans = [
      { startsOn: '2026-10-01', endsOn: '2026-10-05' },
      { startsOn: '2026-11-09', endsOn: '2026-11-20' },
      { startsOn: '2026-12-21', endsOn: '2027-01-04' },
    ];
    expect(timeOffDuring(spans, '2026-11-16', '2026-11-27')).toBe(spans[1]);
    expect(timeOffDuring(spans, '2026-12-28', '2027-01-08')).toBe(spans[2]);
    expect(timeOffDuring(spans, '2026-10-19', '2026-10-30')).toBeNull();
  });
});

describe('crewToTeams', () => {
  const assignment = (
    role: 'sprint_person' | 'lunch_host',
    memberName: string,
    extra: { dueMemberName?: string; change?: unknown; away?: boolean } = {}
  ) => ({
    role,
    memberName,
    dueMemberName: extra.dueMemberName ?? memberName,
    change: extra.change ?? null,
    away: extra.away ?? false,
  });
  const sprints = [
    {
      title: 'PROJ Sprint 42',
      startsOn: '2026-10-19',
      endsOn: '2026-11-01',
      assignments: [
        assignment('sprint_person', 'Alex Example'),
        assignment('lunch_host', 'Chris Example', {
          dueMemberName: 'Bea Example',
          change: { mode: 'swap' },
        }),
      ],
    },
    {
      title: 'Sprint 43',
      startsOn: '2026-11-02',
      endsOn: '2026-11-15',
      assignments: [assignment('sprint_person', 'Bea Example', { away: true })],
    },
    {
      title: 'Sprint 44',
      startsOn: '2026-11-16',
      endsOn: '2026-11-29',
      assignments: [],
    },
  ];

  it('says who is on this sprint with the release and lunch day, then who is up next', () => {
    expect(crewToTeams(sprints).text.split('\n')).toEqual([
      'Crew · PROJ Sprint 42 (19 Oct – 1 Nov)',
      '🚀 Sprint person: Alex Example · release Fri 30 Oct',
      '🍕 Lunch & retro host: Chris Example (in for Bea Example) · lunch Fri 30 Oct',
      '',
      'Up next',
      '• Sprint 43 (2 – 15 Nov): 🚀 Bea Example (away part of it)',
      '• Sprint 44 (16 – 29 Nov): nobody yet',
    ]);
  });

  it('gives Teams HTML with the names in bold and the next sprints as a list', () => {
    const { html } = crewToTeams(sprints);
    expect(html).toContain('<b>Alex Example</b>');
    expect(html).toContain(
      '🍕 Lunch &amp; retro host: <b>Chris Example</b> (in for Bea Example)'
    );
    expect(html).toContain(
      '<ul><li>Sprint 43 (2 – 15 Nov): 🚀 Bea Example (away part of it)</li>'
    );
  });

  it('escapes names, so a name cannot add markup to the message', () => {
    const [first] = sprints;
    const { html } = crewToTeams([
      {
        ...first!,
        assignments: [
          assignment('sprint_person', '<img src=x onerror=alert(1)>'),
        ],
      },
    ]);
    expect(html).toContain('<b>&lt;img src=x onerror=alert(1)&gt;</b>');
    expect(html).not.toContain('<img');
  });

  it('is empty when no sprint is known', () => {
    expect(crewToTeams([])).toEqual({ html: '', text: '' });
  });
});
