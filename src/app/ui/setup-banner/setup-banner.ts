import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '@ui/button/button';

/**
 * The strip under the top bar while Ahoy is not ready (`ahoy-hosted` design D23): what is left in one line, how far
 * along, and the way to Team settings › Setup. The words come from the caller; it shows them as given.
 *
 * ```html
 * <ah-setup-banner heading="Ahoy is not ready yet: 6 of 8 required steps done." text="Next: Phases." [percent]="75" />
 * ```
 */
@Component({
  selector: 'ah-setup-banner',
  imports: [Button, RouterLink],
  styles: `
    :host {
      display: block;
      background: var(--notice-bg);
      border-bottom: 1px solid var(--notice-line);
      color: var(--notice-fg);
    }
    .strip {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 16px;
      max-width: var(--page-max);
      margin: 0 auto;
      padding: 10px 24px;
      box-sizing: border-box;
    }
    .mark {
      flex: 0 0 auto;
      display: inline-grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1px solid var(--notice-line);
      font-weight: 700;
    }
    .words {
      flex: 1 1 360px;
      margin: 0;
    }
    .bar {
      flex: 0 0 140px;
      height: 6px;
      border-radius: 3px;
      background: var(--notice-line);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--notice-fg);
    }
    @media (max-width: 600px) {
      .strip {
        padding-inline: 16px;
      }
      .bar {
        display: none;
      }
    }
  `,
  template: `
    <div class="strip" role="status">
      <span class="mark" aria-hidden="true">!</span>
      <p class="words">
        <b>{{ heading() }}</b> {{ text() }}
      </p>
      <div
        class="bar"
        role="progressbar"
        aria-label="Required setup steps done"
        [attr.aria-valuenow]="percent()"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span [style.width.%]="percent()"></span>
      </div>
      <a ahButton="primary" size="sm" routerLink="/settings/setup"
        >Open setup</a
      >
    </div>
  `,
})
export class SetupBanner {
  /** The bold first words. */
  readonly heading = input.required<string>();
  /** The rest of the line. */
  readonly text = input('');
  /** How far along, from 0 to 100. */
  readonly percent = input(0);
}
