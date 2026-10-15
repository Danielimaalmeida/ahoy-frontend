import {
  AGROUND,
  boardStatus,
  IN_PORT,
  isAground,
  statusPresentation,
} from './status';
import type { StatusModifier } from './status';
import type { Phase, StoryStatus } from './types';

describe('statusPresentation', () => {
  const CASES: readonly (readonly [
    StoryStatus,
    Phase | null,
    string,
    StatusModifier,
    string,
  ])[] = [
    ['ready', null, 'Queued', 'queued', 'ready'],
    ['running', null, 'Running', 'running', 'running'],
    ['awaiting_input', null, 'Needs answers', 'input', 'awaiting_input'],
    [
      'awaiting_decision',
      null,
      'Needs decision',
      'decision',
      'awaiting_decision',
    ],
    ['halted', null, 'Halted', 'halted', 'halted'],
    ['terminal', 'done', 'Done', 'done', 'terminal'],
    ['terminal', 'blocked', 'Blocked', 'blocked', 'terminal'],
  ];

  for (const [status, phase, label, modifier, api] of CASES) {
    it(`shows ${status}${phase === null ? '' : ` · ${phase}`} as "${label}"`, () => {
      expect(statusPresentation(status, phase)).toEqual({
        label,
        modifier,
        api,
      });
    });
  }

  it('falls back to Done for a terminal voyage whose phase is not blocked', () => {
    expect(statusPresentation('terminal', null).label).toBe('Done');
    expect(statusPresentation('terminal', 'done').modifier).toBe('done');
  });
});

describe('IN_PORT', () => {
  it('is the API status of the voyages that are over', () => {
    expect(IN_PORT).toBe('terminal');
  });
});

describe('boardStatus', () => {
  it('sets a terminal voyage at phase blocked apart: it waits for a person, it is not over', () => {
    expect(boardStatus('terminal', 'blocked')).toBe(AGROUND);
    expect(AGROUND).toBe('blocked');
    expect(isAground({ status: 'terminal', phase: 'blocked' })).toBe(true);
  });

  it('keeps every other status, a done voyage among them', () => {
    expect(boardStatus('terminal', 'done')).toBe('terminal');
    expect(boardStatus('terminal', null)).toBe('terminal');
    expect(boardStatus('halted', 'blocked')).toBe('halted');
    expect(boardStatus('running')).toBe('running');
    expect(isAground({ status: 'terminal', phase: 'done' })).toBe(false);
  });
});
