import { Component, input } from '@angular/core';
import { Icon } from '@ui/icon/icon';
import type { IconName } from '@ui/icon/icons';

/**
 * How much room an empty state takes: `panel` fills a panel (the design system's EmptyState); `page` is the first use of
 * a screen, with the icon in a soft circle, room for two actions and more below them (steps, a form); `compact` sits
 * inside a table or a list that keeps its header.
 */
export type EmptyStateSize = 'panel' | 'page' | 'compact';

/**
 * What a list or panel shows when it has nothing: an icon, a short title, one sentence on what will appear, and one way
 * forward (two at most: the main one first). Put it inside the panel. Keep the nautical voice light and the meaning
 * exact ("Calm seas. Nothing needs you right now."); for a filter with no results, say which filter and offer to clear
 * it. An error is not an empty state. Anything marked `ahEmptyExtra` goes below the actions.
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
    <div
      class="ah-empty"
      [class.ah-empty--page]="size() === 'page'"
      [class.ah-empty--compact]="size() === 'compact'"
    >
      @if (size() === 'page') {
        <span class="ah-empty__mark"
          ><ah-icon [name]="icon()" [size]="18"
        /></span>
      } @else {
        <ah-icon [name]="icon()" [size]="18" />
      }
      <span class="ah-empty__title">{{ heading() }}</span>
      <span class="ah-muted"><ng-content /></span>
      <div class="ah-empty__actions">
        <ng-content select="[ahEmptyAction]" />
      </div>
      <ng-content select="[ahEmptyExtra]" />
    </div>
  `,
})
export class EmptyState {
  /** The short title. */
  readonly heading = input.required<string>();
  /** The icon above it; the anchor by default. */
  readonly icon = input<IconName>('anchor');
  /** How much room it takes; a panel's worth by default. */
  readonly size = input<EmptyStateSize>('panel');
}
