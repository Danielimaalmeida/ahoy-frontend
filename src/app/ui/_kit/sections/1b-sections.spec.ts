import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { THEME_STORAGE } from '@ui/theme/theme.service';
import { Kit } from '../kit';
import { KIT_SECTIONS_1B } from './1b-sections';

async function render(): Promise<{
  root: HTMLElement;
  section: (id: string) => HTMLElement;
}> {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: THEME_STORAGE, useValue: null }],
  });
  const fixture = TestBed.createComponent(Kit);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return {
    root,
    section: (id) => root.querySelector<HTMLElement>(`section#${id}`)!,
  };
}

describe('kit gallery, lane 1B sections', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it("has one section per component of the lane, in the order of the design system's groups", () => {
    expect(KIT_SECTIONS_1B.map((s) => s.id)).toEqual([
      'status-badge',
      'phase-stepper',
      'budget-meter',
      'outcome-pill',
      'filter-chips',
      'section-tabs',
      'top-bar',
      'empty-state',
      'skeleton',
      'toast',
      'pipes',
    ]);
    expect(KIT_SECTIONS_1B.every((s) => s.lane === '1B')).toBe(true);
  });

  it('shows the seven status badges of vocabulary.md', async () => {
    const { section } = await render();
    const labels = Array.from(
      section('status-badge').querySelectorAll('.ah-badge')
    )
      .slice(0, 7)
      .map((b) => b.textContent);
    expect(labels).toEqual([
      'Queued',
      'Running',
      'Needs answers',
      'Needs decision',
      'Halted',
      'Done',
      'Blocked',
    ]);
  });

  it('shows the full stepper in four cases and the compact bars in five', async () => {
    const { section } = await render();
    expect(
      section('phase-stepper').querySelectorAll('.ah-stepper').length
    ).toBe(4);
    expect(section('phase-stepper').querySelectorAll('.ah-dots').length).toBe(
      5
    );
  });

  it('shows the meter at 0, 41 and 100 %', async () => {
    const { section } = await render();
    const fills = Array.from(
      section('budget-meter').querySelectorAll<HTMLElement>('.ah-meter__fill')
    ).map((f) => f.style.width);
    expect(fills).toContain('0%');
    expect(fills).toContain('41%');
    expect(fills).toContain('100%');
  });

  it('shows the top bar while live, while reconnecting and with live updates off', async () => {
    const { section } = await render();
    const states = Array.from(
      section('top-bar').querySelectorAll("[role='status']")
    ).map((s) => s.textContent!.trim());
    expect(states).toEqual([
      'Live',
      'Reconnecting to live updates…',
      'Live updates are off',
    ]);
  });

  it('shows every outcome word of the vocabulary', async () => {
    const { section } = await render();
    expect(
      section('outcome-pill').querySelectorAll('ah-outcome-pill').length
    ).toBe(20);
  });

  it('shows the empty and loading states, and every pipe', async () => {
    const { section } = await render();
    expect(section('empty-state').querySelectorAll('.ah-empty').length).toBe(2);
    expect(
      section('skeleton').querySelector("[aria-busy='true']")
    ).not.toBeNull();
    const shown = Array.from(
      section('pipes').querySelectorAll('tbody td:last-child')
    ).map((td) => td.textContent?.replace(/\s+/g, ' ').trim());
    expect(shown).toEqual([
      '12.4 · 12.40 · 12',
      '22 m ago · 22 m',
      'Wed 09:48',
      'Ahoy · alex@example.com',
    ]);
  });

  describe('toast demo', () => {
    afterEach(() => vi.useRealTimers());

    it('shows a real toast on its own host when the button is pressed, and it goes after 5 seconds', async () => {
      const { root, section } = await render();
      // Fake timers only after the first render: `whenStable` would wait for them.
      vi.useFakeTimers();
      const host = section('toast').querySelector('.ah-toast-host')!;
      expect(host.querySelectorAll('.ah-toast').length).toBe(0);
      section('toast').querySelector<HTMLButtonElement>('button')!.click();
      await Promise.resolve();
      TestBed.tick();
      expect(host.querySelectorAll('.ah-toast').length).toBe(1);
      expect(root.querySelectorAll('.ah-toast-host .ah-toast').length).toBe(1);
      vi.advanceTimersByTime(5000);
      TestBed.tick();
      expect(host.querySelectorAll('.ah-toast').length).toBe(0);
    });
  });
});
