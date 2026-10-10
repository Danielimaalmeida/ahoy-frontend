import { Component, input } from '@angular/core';
import { Icon } from '@ui/icon/icon';
import type { IconName } from '@ui/icon/icons';

/**
 * What a list or panel shows when it has nothing: an icon, a short title, one sentence on what will appear, and one way
 * forward. Put it inside the panel. Keep the nautical voice light and the meaning exact ("Calm seas. Nothing needs you
 * right now."); for a filter with no results, say which filter and offer to clear it. An error is not an empty state.
 *
 * ```html
 * <ah-empty-state heading="Calm seas">
 *   Nothing needs you right now. Questions, decisions and anchored voyages show up here.
 *   <a ahButton ahEmptyAction routerLink="/voyages">See all voyages</a>
 * </ah-empty-state>
 * ```
 */
@Component({
  selector: 'ah-empty-state',
  imports: [Icon],
  template: `
    <div class="ah-empty">
      <ah-icon [name]="icon()" [size]="18" />
      <span class="ah-empty__title">{{ heading() }}</span>
      <span class="ah-muted"><ng-content /></span>
      <ng-content select="[ahEmptyAction]" />
    </div>
  `,
})
export class EmptyState {
  /** The short title. */
  readonly heading = input.required<string>();
  /** The icon above it; the anchor by default. */
  readonly icon = input<IconName>('anchor');
}
