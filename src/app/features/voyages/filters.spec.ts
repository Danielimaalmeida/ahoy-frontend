import { aStory } from '@core/realtime/testing/events';
import { chipCounts, filterOf, matchesFilter, matchesQuery } from './filters';

describe('filterOf', () => {
  it('accepts the six statuses the API has', () => {
    for (const status of [
      'ready',
      'running',
      'awaiting_input',
      'awaiting_decision',
      'halted',
      'terminal',
    ]) {
      expect(filterOf(status)).toBe(status);
    }
  });

  it('accepts blocked, the chip of the voyages aground', () => {
    expect(filterOf('blocked')).toBe('blocked');
  });

  it('reads anything else, which comes from the address bar, as All', () => {
    for (const raw of [
      undefined,
      null,
      '',
      'all',
      'HALTED',
      'halted,ready',
      '<script>',
      3,
      ['halted'],
      {},
    ]) {
      expect(filterOf(raw)).toBe('all');
    }
  });
});

describe('matchesQuery', () => {
  const story = aStory('PROJ-123', {
    title: 'Show invoice due date on the billing page',
  });

  it('matches the key or the title, ignoring case and the spaces around the text', () => {
    expect(matchesQuery(story, 'proj-123')).toBe(true);
    expect(matchesQuery(story, '  INVOICE ')).toBe(true);
    expect(matchesQuery(story, '123')).toBe(true);
    expect(matchesQuery(story, 'billing page')).toBe(true);
  });

  it('does not match text that is in neither', () => {
    expect(matchesQuery(story, 'receipts')).toBe(false);
    expect(matchesQuery(story, 'PROJ-999')).toBe(false);
  });

  it('matches everything for an empty query, and a voyage with no title by its key only', () => {
    expect(matchesQuery(story, '')).toBe(true);
    expect(matchesQuery(story, '   ')).toBe(true);
    const bare = aStory('PROJ-200', { title: null });
    expect(matchesQuery(bare, 'proj-2')).toBe(true);
    expect(matchesQuery(bare, 'null')).toBe(false);
  });

  it('takes the text literally, not as a pattern', () => {
    expect(matchesQuery(story, '.*')).toBe(false);
    expect(
      matchesQuery(
        aStory('PROJ-1', { title: 'Fix (all) the [things]' }),
        '(all) the ['
      )
    ).toBe(true);
  });
});

describe('chipCounts', () => {
  const stories = [
    aStory('PROJ-1', { status: 'running', title: 'Alpha' }),
    aStory('PROJ-2', { status: 'halted', title: 'Alpha two' }),
    aStory('PROJ-3', { status: 'halted', title: 'Beta' }),
    aStory('PROJ-4', {
      status: 'terminal',
      phase: 'done',
      title: 'Alpha three',
    }),
    aStory('PROJ-5', { status: 'terminal', phase: 'blocked', title: 'Gamma' }),
  ];

  it('counts all of them and each status, a blocked voyage under Blocked and not under Ended', () => {
    expect(chipCounts(stories, '')).toEqual({
      all: 5,
      ready: 0,
      running: 1,
      awaiting_input: 0,
      awaiting_decision: 0,
      halted: 2,
      blocked: 1,
      terminal: 1,
    });
  });

  it('counts what the search leaves, so a chip says what pressing it would show', () => {
    expect(chipCounts(stories, 'alpha')).toEqual({
      all: 3,
      ready: 0,
      running: 1,
      awaiting_input: 0,
      awaiting_decision: 0,
      halted: 1,
      blocked: 0,
      terminal: 1,
    });
  });
});

describe('matchesFilter', () => {
  const done = aStory('PROJ-1', { status: 'terminal', phase: 'done' });
  const aground = aStory('PROJ-2', { status: 'terminal', phase: 'blocked' });
  const halted = aStory('PROJ-3', { status: 'halted' });

  it('puts a blocked voyage under Blocked and a done one under Ended, never both', () => {
    expect(matchesFilter(aground, 'blocked')).toBe(true);
    expect(matchesFilter(aground, 'terminal')).toBe(false);
    expect(matchesFilter(done, 'terminal')).toBe(true);
    expect(matchesFilter(done, 'blocked')).toBe(false);
  });

  it('matches every voyage for All, and the rest by their status', () => {
    for (const story of [done, aground, halted])
      expect(matchesFilter(story, 'all')).toBe(true);
    expect(matchesFilter(halted, 'halted')).toBe(true);
    expect(matchesFilter(halted, 'blocked')).toBe(false);
  });
});
