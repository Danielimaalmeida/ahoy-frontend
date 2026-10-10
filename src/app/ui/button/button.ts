import { Directive, computed, input } from '@angular/core';

/** Button variants of the design system; `default` is the secondary surface button. */
export const BUTTON_VARIANTS = [
  'default',
  'primary',
  'soft',
  'ghost',
  'danger',
  'danger-outline',
] as const;

/** A button variant: one primary per view, `danger` only to confirm inside a dialog. */
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

/** Button sizes: 28px (`sm`, table rows and panel headers), 34px (`md`), 40px (`lg`, the one confirm in a form). */
export const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;

/** A button size. */
export type ButtonSize = (typeof BUTTON_SIZES)[number];

/** The bundle classes for a variant and size. */
export function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize
): string[] {
  return [
    'ah-btn',
    ...(variant === 'default' ? [] : [`ah-btn--${variant}`]),
    ...(size === 'md' ? [] : [`ah-btn--${size}`]),
  ];
}

/**
 * Styles a native `<button>` or `<a>` as a design-system button; the element keeps its own semantics, so set
 * `type` and `disabled` (or `aria-disabled` on a link) as usual. `<button ahButton="primary" size="sm">`.
 */
@Directive({
  selector: 'button[ahButton], a[ahButton]',
  host: { '[class]': 'classes()' },
})
export class Button {
  /** The variant; a bare `ahButton` is the default button. */
  readonly variant = input<ButtonVariant, ButtonVariant | ''>('default', {
    alias: 'ahButton',
    transform: (v) => (v === '' ? 'default' : v),
  });
  /** The size. */
  readonly size = input<ButtonSize>('md');

  protected readonly classes = computed(() =>
    buttonClasses(this.variant(), this.size()).join(' ')
  );
}
