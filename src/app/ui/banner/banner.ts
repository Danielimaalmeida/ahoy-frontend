import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { Icon } from '@ui/icon/icon';
import type { IconName } from '@ui/icon/icons';

/** Banner variants: `notice` (changed since you opened it), `error` (anchored, decided first), `info`, and `cost`. */
export const BANNER_VARIANTS = ['notice', 'error', 'info', 'cost'] as const;

/** A banner variant. */
export type BannerVariant = (typeof BANNER_VARIANTS)[number];

/** How a banner is announced: `alert` interrupts, `status` waits, `off` is read in page order. */
export type BannerAnnounce = 'alert' | 'status' | 'off';

/** The icon each banner variant shows unless told otherwise; the cost box has none. */
const DEFAULT_ICONS: Readonly<Record<BannerVariant, IconName | null>> = {
  notice: 'refresh',
  error: 'anchor',
  info: 'info',
  cost: null,
};

/** The announcement each variant gets by default, as in the Banner preview. */
const DEFAULT_ANNOUNCE: Readonly<Record<BannerVariant, BannerAnnounce>> = {
  notice: 'alert',
  error: 'status',
  info: 'off',
  cost: 'off',
};

/**
 * An inline callout for something the person must know before acting. The projected content is the plain-words
 * explanation; `tech` adds the technical line (`ah-tech`) last. `cost` renders the `ah-cost` box: the heading says how
 * much may be spent and the content who is billed.
 *
 * ```html
 * <ah-banner variant="error" heading="Anchored: the planning run failed" tech="run_failed · r-03">No AIU was spent.</ah-banner>
 * ```
 */
@Component({
  selector: 'ah-banner',
  imports: [Icon, NgTemplateOutlet],
  template: `
    <ng-template #text><ng-content /></ng-template>
    @if (variant() === 'cost') {
      <div class="ah-cost" [attr.role]="role()">
        @if (heading()) {
          <b>{{ heading() }}</b>
        }
        <span class="ah-hint"><ng-container [ngTemplateOutlet]="text" /></span>
      </div>
    } @else {
      <div [class]="'ah-banner ah-banner--' + variant()" [attr.role]="role()">
        @if (iconName(); as name) {
          <ah-icon [name]="name" [size]="18" />
        }
        <div [class.ah-banner__body]="!!tech()">
          @if (heading()) {
            <span class="ah-banner__title">{{ heading() }}</span>
          }
          <ng-container [ngTemplateOutlet]="text" />
          @if (tech()) {
            <span class="ah-tech">{{ tech() }}</span>
          }
        </div>
      </div>
    }
  `,
})
export class Banner {
  /** The kind of callout. */
  readonly variant = input<BannerVariant>('notice');
  /** The bold first line. */
  readonly heading = input('');
  /** The technical line (`status · code · request id`), shown last in mono. */
  readonly tech = input('');
  /** Another icon than the variant's own, or `null` for none. */
  readonly icon = input<IconName | null | undefined>(undefined);
  /** How screen readers announce it; by default `alert` for notice, `status` for error, `off` otherwise. */
  readonly announce = input<BannerAnnounce | undefined>(undefined);

  protected readonly iconName = computed(() => {
    const icon = this.icon();
    return icon === undefined ? DEFAULT_ICONS[this.variant()] : icon;
  });
  protected readonly role = computed(() => {
    const announce = this.announce() ?? DEFAULT_ANNOUNCE[this.variant()];
    return announce === 'off' ? null : announce;
  });
}
