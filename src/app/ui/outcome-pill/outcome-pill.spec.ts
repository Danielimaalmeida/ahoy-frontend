import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OutcomePill } from './outcome-pill';

@Component({
  imports: [OutcomePill],
  template: `<ah-outcome-pill [value]="value()" />`,
})
class Host {
  readonly value = signal('pass');
}

function render(value: string) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.value.set(value);
  fixture.detectChanges();
  return {
    fixture,
    pill: (fixture.nativeElement as HTMLElement).querySelector(
      'ah-outcome-pill'
    )!,
  };
}

/** The OutcomePill README's table: the API word and the class that groups it. */
const GROUPS: Readonly<Record<string, readonly string[]>> = {
  'ah-badge--done': ['pass', 'approve', 'succeeded'],
  'ah-badge--input': ['branch'],
  'ah-badge--sendback': ['send_back'],
  'ah-badge--halted': [
    'fail',
    'error',
    'reject',
    'halt',
    'failed',
    'lost',
    'timed_out',
    'auth_failed',
    'output_violation',
    'budget_exceeded',
  ],
  'ah-badge--decision': ['waiting'],
  'ah-badge--queued': ['queued', 'cancelled'],
  'ah-badge--running': ['running'],
};

describe('ah-outcome-pill', () => {
  for (const [modifier, words] of Object.entries(GROUPS))
    for (const word of words)
      it(`shows "${word}" with ${modifier} and no dot`, () => {
        const { pill } = render(word);
        expect(pill.className).toBe(`ah-badge ${modifier}`);
        expect(pill.textContent).toBe(word);
        expect(pill.children.length).toBe(0);
      });

  it('covers every word of the README table', () => {
    expect(Object.values(GROUPS).flat().length).toBe(19);
  });

  it('shows a run that stopped to ask questions like the branch gate that asks them', () => {
    const { pill } = render('awaiting_input');
    expect(pill.className).toBe('ah-badge ah-badge--input');
    expect(pill.textContent).toBe('awaiting_input');
  });

  it('shows an unknown word as it came, in the neutral colour', () => {
    const { pill } = render('something_new');
    expect(pill.className).toBe('ah-badge ah-badge--queued');
    expect(pill.textContent).toBe('something_new');
  });

  it('follows its input', () => {
    const { fixture, pill } = render('pass');
    fixture.componentInstance.value.set('send_back');
    fixture.detectChanges();
    expect(pill.className).toBe('ah-badge ah-badge--sendback');
    expect(pill.textContent).toBe('send_back');
  });
});
