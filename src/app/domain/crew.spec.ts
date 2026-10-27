import { describe, expect, it } from 'vitest';
import {
  awayLabel,
  cleanName,
  dayLabel,
  initial,
  isDay,
  ROLE_WORDS,
  spanLabel,
  sprintProgress,
  sprintTitle,
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
