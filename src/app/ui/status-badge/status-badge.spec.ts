import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PHASES } from '@domain/phases';
import type { StoryStatus } from '@domain/types';
import { StatusBadge } from './status-badge';

@Component({
  imports: [StatusBadge],
  template: `<ah-status-badge
    [status]="status()"
    [phase]="phase()"
    [showApi]="showApi()"
    [detail]="detail()"
  />`,
})
class Host {
  readonly status = signal<StoryStatus>('ready');
  readonly phase = signal<string | null>(null);
  readonly showApi = signal(false);
  readonly detail = signal('');
}

function render(
  status: StoryStatus,
  phase: string | null = null,
  showApi = false,
  detail = ''
) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.status.set(status);
  fixture.componentInstance.phase.set(phase);
  fixture.componentInstance.showApi.set(showApi);
  fixture.componentInstance.detail.set(detail);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    root,
    badge: root.querySelector('.ah-badge')!,
    api: root.querySelector('.ah-api'),
  };
}

/** The status table of `docs/design/design-system/vocabulary.md`: API status, label and badge class. */
const FOR_EVERY_PHASE: readonly [StoryStatus, string, string][] = [
  ['ready', 'Queued', 'ah-badge--queued'],
  ['running', 'Running', 'ah-badge--running'],
  ['awaiting_input', 'Needs answers', 'ah-badge--input'],
  ['awaiting_decision', 'Needs decision', 'ah-badge--decision'],
  ['halted', 'Halted', 'ah-badge--halted'],
];

describe('ah-status-badge: every status and phase against vocabulary.md', () => {
  for (const [status, label, modifier] of FOR_EVERY_PHASE)
    for (const phase of [null, ...PHASES, 'blocked'])
      it(`${status} in ${phase ?? 'no phase'} reads "${label}" with ${modifier}`, () => {
        const { badge } = render(status, phase);
        expect(badge.className).toBe(`ah-badge ${modifier}`);
        expect(badge.textContent).toBe(label);
      });

  for (const phase of [null, ...PHASES.filter((p) => p !== 'done'), 'done'])
    it(`terminal in ${phase ?? 'no phase'} reads "Done" with ah-badge--done`, () => {
      const { badge } = render('terminal', phase);
      expect(badge.className).toBe('ah-badge ah-badge--done');
      expect(badge.textContent).toBe('Done');
    });

  it('terminal in the blocked phase reads Blocked with ah-badge--blocked', () => {
    const { badge } = render('terminal', 'blocked');
    expect(badge.className).toBe('ah-badge ah-badge--blocked');
    expect(badge.textContent).toBe('Blocked');
  });
});

describe('ah-status-badge', () => {
  it('draws the dot before the label and nothing else, and no API word by default', () => {
    const { badge, api } = render('awaiting_decision');
    expect(badge.firstElementChild!.className).toBe('ah-badge__dot');
    expect(badge.children.length).toBe(1);
    expect(api).toBeNull();
  });

  it('shows the API word in ah-api beside the badge when showApi is set', () => {
    const { root, badge, api } = render(
      'awaiting_decision',
      'plan_review',
      true
    );
    expect(api!.textContent).toBe('awaiting_decision');
    expect(badge.nextElementSibling).toBe(api);
    expect(root.textContent).toBe('Needs decision' + 'awaiting_decision');
  });

  it('shows the API word of a terminal status, whether Done or Blocked', () => {
    expect(render('terminal', 'done', true).api!.textContent).toBe('terminal');
    expect(render('terminal', 'blocked', true).api!.textContent).toBe(
      'terminal'
    );
  });

  it('appends the detail (a gate or a halt reason) to the API word', () => {
    expect(
      render('awaiting_decision', 'plan_review', true, 'plan_accepted').api!
        .textContent
    ).toBe('awaiting_decision · plan_accepted');
    expect(
      render('halted', 'planning', true, 'run_failed').api!.textContent
    ).toBe('halted · run_failed');
  });

  it('does not show the detail without showApi', () => {
    expect(render('halted', 'planning', false, 'run_failed').api).toBeNull();
  });

  it('shows a status it does not know as it came, in the neutral colour, instead of failing', () => {
    const { badge } = render('paused' as StoryStatus, null, true);
    expect(badge.className).toBe('ah-badge ah-badge--queued');
    expect(badge.textContent).toBe('paused');
  });

  it('follows its inputs', () => {
    const { fixture, badge } = render('running');
    fixture.componentInstance.status.set('halted');
    fixture.detectChanges();
    expect(badge.className).toBe('ah-badge ah-badge--halted');
    expect(badge.textContent).toBe('Halted');
  });
});
