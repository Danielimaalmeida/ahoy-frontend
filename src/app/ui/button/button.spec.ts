import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ButtonSize, ButtonVariant } from './button';
import { BUTTON_SIZES, BUTTON_VARIANTS, Button, buttonClasses } from './button';

/** Expected classes for every variant and size, as the Button README lists them. */
const VARIANT_CLASS: Record<ButtonVariant, string[]> = {
  default: [],
  primary: ['ah-btn--primary'],
  soft: ['ah-btn--soft'],
  ghost: ['ah-btn--ghost'],
  danger: ['ah-btn--danger'],
  'danger-outline': ['ah-btn--danger-outline'],
};
const SIZE_CLASS: Record<ButtonSize, string[]> = {
  sm: ['ah-btn--sm'],
  md: [],
  lg: ['ah-btn--lg'],
};

@Component({
  imports: [Button],
  template: `
    <button ahButton="primary" size="sm" type="submit" class="extra" disabled>
      Answer
    </button>
    <a ahButton href="/voyages/PROJ-118">Review &amp; resume</a>
    <button [ahButton]="variant()" [size]="size()" type="button">Live</button>
  `,
})
class Host {
  readonly variant = signal<ButtonVariant>('default');
  readonly size = signal<ButtonSize>('md');
}

describe('buttonClasses', () => {
  for (const variant of BUTTON_VARIANTS)
    for (const size of BUTTON_SIZES)
      it(`gives ${variant} ${size} the bundle classes`, () => {
        expect(buttonClasses(variant, size)).toEqual([
          'ah-btn',
          ...VARIANT_CLASS[variant],
          ...SIZE_CLASS[size],
        ]);
      });
});

describe('ahButton', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const [submit, link, live] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button, a')
    );
    return { fixture, submit: submit!, link: link!, live: live! };
  }

  it('styles a native button and keeps its type, disabled state and own classes', () => {
    const { submit } = render();
    expect(submit.className.split(' ').sort()).toEqual([
      'ah-btn',
      'ah-btn--primary',
      'ah-btn--sm',
      'extra',
    ]);
    expect(submit.getAttribute('type')).toBe('submit');
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it('treats a bare ahButton on a link as the default button and keeps the link', () => {
    const { link } = render();
    expect(link.className).toBe('ah-btn');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/voyages/PROJ-118');
  });

  it('follows variant and size changes', async () => {
    const { fixture, live } = render();
    expect(live.className).toBe('ah-btn');
    fixture.componentInstance.variant.set('danger-outline');
    fixture.componentInstance.size.set('lg');
    await fixture.whenStable();
    expect(live.className.split(' ').sort()).toEqual([
      'ah-btn',
      'ah-btn--danger-outline',
      'ah-btn--lg',
    ]);
  });
});
