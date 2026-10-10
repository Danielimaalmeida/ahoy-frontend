import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BudgetMeter, formatCap } from './budget-meter';

const AIU = 1_000_000_000;

@Component({
  imports: [BudgetMeter],
  template: `
    <ah-budget-meter
      [spentNanoAiu]="spent()"
      [capNanoAiu]="cap()"
      [decimals]="decimals()"
      [width]="width()"
      [variant]="variant()"
    />
  `,
})
class Host {
  readonly spent = signal(0);
  readonly cap = signal(30 * AIU);
  readonly decimals = signal(1);
  readonly width = signal(120);
  readonly variant = signal<'full' | 'compact'>('full');
}

function render(spentNano: number, capNano = 30 * AIU, decimals = 1) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.spent.set(spentNano);
  fixture.componentInstance.cap.set(capNano);
  fixture.componentInstance.decimals.set(decimals);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const meter = root.querySelector<HTMLElement>('.ah-meter')!;
  const fill = meter.querySelector<HTMLElement>('.ah-meter__fill')!;
  return {
    fixture,
    root,
    meter,
    fill,
    text: root.querySelector('.ah-budget > span')!.textContent,
  };
}

describe('ah-budget-meter', () => {
  it('shows 0 % with nothing spent', () => {
    const { meter, fill, text } = render(0);
    expect(fill.style.width).toBe('0%');
    expect(text).toBe('0.0 / 30 AIU');
    expect(meter.getAttribute('aria-valuenow')).toBe('0.0');
    expect(meter.getAttribute('aria-valuemax')).toBe('30');
  });

  it('shows 41 % for 12.4 of 30 AIU, with the figures from the README', () => {
    const { meter, fill, text, root } = render(12_400_000_000);
    expect(fill.style.width).toBe('41%');
    expect(text).toBe('12.4 / 30 AIU');
    expect(root.querySelector('.ah-budget b')!.textContent).toBe('12.4');
    expect(meter.getAttribute('role')).toBe('meter');
    expect(meter.getAttribute('aria-label')).toBe('Budget');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('30');
    expect(meter.getAttribute('aria-valuenow')).toBe('12.4');
    expect(meter.getAttribute('aria-valuetext')).toBe('12.4 of 30 AIU');
  });

  it('shows 100 % when the whole cap is spent', () => {
    const { meter, fill, text } = render(30 * AIU);
    expect(fill.style.width).toBe('100%');
    expect(text).toBe('30.0 / 30 AIU');
    expect(meter.getAttribute('aria-valuenow')).toBe('30.0');
  });

  it('keeps aria-valuenow within the cap when a run overshoots it, and still says what was spent', () => {
    const { meter, fill, text } = render(31_200_000_000);
    expect(fill.style.width).toBe('100%');
    expect(text).toBe('31.2 / 30 AIU');
    expect(meter.getAttribute('aria-valuenow')).toBe('30.0');
    expect(meter.getAttribute('aria-valuetext')).toBe('31.2 of 30 AIU');
  });

  it('does not change colour as it fills: the fill has the same class at 0, 41 and 100 %', () => {
    const classes = [0, 12_400_000_000, 30 * AIU].map((spent) => {
      const { meter, fill } = render(spent);
      return [
        meter.className,
        fill.className,
        meter.getAttribute('class'),
        fill.getAttribute('style')?.includes('background'),
      ];
    });
    for (const row of classes) {
      expect(row[0]).toBe('ah-meter');
      expect(row[1]).toBe('ah-meter__fill');
      expect(row[3]).toBe(false);
    }
  });

  it("shows two decimals on run detail and keeps the cap's own fraction: 1.84 / 28.6", () => {
    const { text, meter, fill } = render(1_840_000_000, 28_600_000_000, 2);
    expect(text).toBe('1.84 / 28.6 AIU');
    expect(fill.style.width).toBe('6%');
    expect(meter.getAttribute('aria-valuenow')).toBe('1.84');
    expect(meter.getAttribute('aria-valuemax')).toBe('28.6');
  });

  it('drops only trailing zeros of the cap', () => {
    expect(formatCap(30 * AIU, 1)).toBe('30');
    expect(formatCap(30 * AIU, 2)).toBe('30');
    expect(formatCap(28_600_000_000, 2)).toBe('28.6');
    expect(formatCap(100 * AIU, 1)).toBe('100');
    expect(formatCap(10_500_000_000, 2)).toBe('10.5');
    expect(formatCap(0, 1)).toBe('0');
    expect(formatCap(30 * AIU, 0)).toBe('30');
    expect(formatCap(20 * AIU, 0)).toBe('20');
  });

  it('reads 0 of a cap of 0 as empty, without dividing by zero', () => {
    const { fill, text } = render(0, 0);
    expect(fill.style.width).toBe('0%');
    expect(text).toBe('0.0 / 0 AIU');
  });

  it('shows an em dash and no value for amounts that are not safe non-negative integers', () => {
    for (const [spent, cap] of [
      [1.5, 30 * AIU],
      [Number.NaN, 30 * AIU],
      [-1, 30 * AIU],
      [0, Number.POSITIVE_INFINITY],
      [0, Number.MAX_SAFE_INTEGER + 2],
    ] as const) {
      const { meter, fill, text } = render(spent, cap);
      expect(text).toBe('— / — AIU');
      expect(fill.style.width).toBe('0%');
      expect(meter.hasAttribute('aria-valuenow')).toBe(false);
      expect(meter.hasAttribute('aria-valuemax')).toBe(false);
    }
  });

  it('gives the bar the width asked for, 120 px by default', () => {
    const { fixture, meter } = render(0);
    expect(meter.style.width).toBe('120px');
    fixture.componentInstance.width.set(64);
    fixture.detectChanges();
    expect(meter.style.width).toBe('64px');
  });

  it('reads 12.4 / 30 in mono, with no unit, in its compact variant', () => {
    const { fixture, root } = render(12_400_000_000);
    fixture.componentInstance.variant.set('compact');
    fixture.detectChanges();
    const text = root.querySelector('.ah-budget > span')!;
    expect(text.className).toBe('ah-mono');
    expect(text.textContent).toBe('12.4 / 30');
    expect(root.querySelector('.ah-budget b')).toBeNull();
  });

  it('follows its inputs', () => {
    const { fixture, fill, text, root } = render(0);
    fixture.componentInstance.spent.set(6_000_000_000);
    fixture.detectChanges();
    expect(fill.style.width).toBe('20%');
    expect(root.querySelector('.ah-budget > span')!.textContent).toBe(
      '6.0 / 30 AIU'
    );
    expect(text).toBe('0.0 / 30 AIU');
  });
});
