import { IN_PORT, statusPresentation } from './status';
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
  it('is the API status that groups Done and Blocked', () => {
    expect(IN_PORT).toBe('terminal');
  });
});
