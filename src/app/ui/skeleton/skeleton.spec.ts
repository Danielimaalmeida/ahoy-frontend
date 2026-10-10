import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SkeletonColumn } from './skeleton';
import { Skeleton, SkeletonRows } from './skeleton';

/** The columns of the Skeleton preview: a 20 px badge, text, and two short fixed ones. */
const PREVIEW_COLUMNS: readonly SkeletonColumn[] = [
  { track: '80px', height: 20 },
  { track: 'minmax(0, 1fr)' },
  { track: '90px' },
  { track: '60px' },
];

@Component({
  imports: [Skeleton, SkeletonRows],
  template: `
    <ah-skeleton id="bar" width="85%" />
    <ah-skeleton id="default" />
    <ah-skeleton id="badge" width="80px" [height]="20" />
    <ah-skeleton-rows id="rows" [rows]="rows()" [columns]="columns" />
  `,
})
class Host {
  readonly rows = signal(3);
  readonly columns = PREVIEW_COLUMNS;
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    root,
    rows: () =>
      Array.from(root.querySelectorAll<HTMLElement>('.ah-skeleton-row')),
  };
}

describe('ah-skeleton', () => {
  it("is a grey bar of the bundle's class, as wide and as tall as it is told", () => {
    const { root } = render();
    const bar = root.querySelector<HTMLElement>('#bar')!;
    expect(bar.classList.contains('ah-skeleton')).toBe(true);
    expect(bar.style.width).toBe('85%');
    expect(bar.style.height).toBe('10px');
    const badge = root.querySelector<HTMLElement>('#badge')!;
    expect(badge.style.width).toBe('80px');
    expect(badge.style.height).toBe('20px');
  });

  it("fills its container's width and is a text bar tall by default", () => {
    const bar = render().root.querySelector<HTMLElement>('#default')!;
    expect(bar.style.width).toBe('100%');
    expect(bar.style.height).toBe('10px');
  });

  it('has no content for a screen reader', () => {
    expect(render().root.querySelector('#bar')!.textContent).toBe('');
  });
});

describe('ah-skeleton-rows', () => {
  it('marks its container aria-busy', () => {
    const container = render().root.querySelector('.ah-skeleton-rows')!;
    expect(container.getAttribute('aria-busy')).toBe('true');
  });

  it('draws as many rows as asked, each with one bar per column', () => {
    const { fixture, rows } = render();
    expect(rows().length).toBe(3);
    expect(
      rows().every((row) => row.querySelectorAll('ah-skeleton').length === 4)
    ).toBe(true);
    fixture.componentInstance.rows.set(5);
    fixture.detectChanges();
    expect(rows().length).toBe(5);
    fixture.componentInstance.rows.set(0);
    fixture.detectChanges();
    expect(rows().length).toBe(0);
  });

  it('lays the columns out on the grid tracks it was given', () => {
    const row = render().rows()[0]!;
    expect(row.style.gridTemplateColumns).toBe('80px minmax(0, 1fr) 90px 60px');
  });

  it("keeps the row's height: the badge bar is 20 px, text bars are 10 px", () => {
    const bars = Array.from(
      render().rows()[0]!.querySelectorAll<HTMLElement>('ah-skeleton')
    );
    expect(bars.map((b) => b.style.height)).toEqual([
      '20px',
      '10px',
      '10px',
      '10px',
    ]);
  });

  it('fills fixed columns and varies the width of flexible ones from row to row', () => {
    const widths = render()
      .rows()
      .map((row) =>
        Array.from(row.querySelectorAll<HTMLElement>('ah-skeleton')).map(
          (b) => b.style.width
        )
      );
    expect(widths).toEqual([
      ['100%', '85%', '100%', '100%'],
      ['100%', '65%', '100%', '100%'],
      ['100%', '75%', '100%', '100%'],
    ]);
  });
});
