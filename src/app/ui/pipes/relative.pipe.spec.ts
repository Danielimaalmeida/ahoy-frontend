import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CLOCK } from './clock';
import { RelativePipe } from './relative.pipe';

const NOW = new Date('2026-10-07T10:00:00.000Z');

@Component({
  imports: [RelativePipe],
  template: `
    <span id="ago">{{ at() | ahRelative }}</span>
    <span id="waiting">{{ at() | ahRelative: 'waiting' }}</span>
    <span id="other">{{ other() }}</span>
  `,
})
class Host {
  readonly at = signal<string | Date | null | undefined>(
    '2026-10-07T09:38:00.000Z'
  );
  /** Something unrelated to the time, to make the view refresh without changing the pipe's arguments. */
  readonly other = signal(0);
}

function render(now: () => Date) {
  TestBed.configureTestingModule({
    providers: [{ provide: CLOCK, useValue: now }],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const text = (id: string) => root.querySelector(`#${id}`)!.textContent;
  return { fixture, text };
}

describe('ahRelative', () => {
  it("measures against the injected clock, as 'ago' or as 'waiting'", () => {
    const { text } = render(() => NOW);
    expect(text('ago')).toBe('22 m ago');
    expect(text('waiting')).toBe('22 m');
  });

  it('accepts a Date as well as a timestamp string', () => {
    const { fixture, text } = render(() => NOW);
    fixture.componentInstance.at.set(new Date('2026-10-07T07:50:00.000Z'));
    fixture.detectChanges();
    expect(text('ago')).toBe('2 h 10 m ago');
    expect(text('waiting')).toBe('2 h 10 m');
  });

  it('gives an em dash for a missing or invalid time', () => {
    const { fixture, text } = render(() => NOW);
    for (const value of [null, undefined, 'not a date']) {
      fixture.componentInstance.at.set(value);
      fixture.detectChanges();
      expect(text('ago')).toBe('—');
      expect(text('waiting')).toBe('—');
    }
  });

  it('reads the clock again whenever the view refreshes, even if its own arguments did not change', () => {
    let now = NOW;
    const { fixture, text } = render(() => now);
    expect(text('ago')).toBe('22 m ago');
    now = new Date('2026-10-07T10:30:00.000Z');
    fixture.componentInstance.other.set(1);
    fixture.detectChanges();
    expect(text('ago')).toBe('52 m ago');
  });

  it('refreshes when the clock reads a signal, which is how a shell can make relative times tick', () => {
    const tick = signal(NOW);
    const { fixture, text } = render(() => tick());
    expect(text('ago')).toBe('22 m ago');
    tick.set(new Date('2026-10-07T11:00:00.000Z'));
    fixture.detectChanges();
    expect(text('ago')).toBe('1 h 22 m ago');
  });

  it('uses the real clock when none is provided', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.at.set(new Date(Date.now() - 5 * 60_000));
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('#ago')!.textContent
    ).toBe('5 m ago');
  });
});
