import { Component, contentChild, inject, input } from "@angular/core";

let nextPanelId = 0;

/**
 * The one container: a bordered `ah-panel` section with optional head, body and foot. Never nest panels and never give
 * them a shadow. When it has an `ah-panel-head` with a heading, the section is labelled by it.
 *
 * ```html
 * <ah-panel>
 *   <ah-panel-head heading="Needs you" subtitle="4 voyages"><button ahButton size="sm" ahPanelActions>Edit</button></ah-panel-head>
 *   <ah-panel-body>…</ah-panel-body>
 *   <ah-panel-foot>…</ah-panel-foot>
 * </ah-panel>
 * ```
 */
@Component({
  selector: "ah-panel",
  template: `
    <section class="ah-panel" [attr.aria-labelledby]="head()?.heading() ? titleId : null">
      <ng-content />
    </section>
  `,
})
export class Panel {
  /** The id of the heading in this panel's head, used by `aria-labelledby`. */
  readonly titleId = `ah-panel-${nextPanelId++}-title`;
  protected readonly head = contentChild(PanelHead);
}

/**
 * The panel header: a `section-title` heading, a muted subtitle, free content, and actions (elements marked
 * `ahPanelActions`) pushed to the right.
 */
@Component({
  selector: "ah-panel-head",
  template: `
    <div class="ah-panel__head">
      @if (heading()) {
        @if (level() === 3) {
          <h3 class="ah-panel__title" [id]="titleId">{{ heading() }}</h3>
        } @else {
          <h2 class="ah-panel__title" [id]="titleId">{{ heading() }}</h2>
        }
      }
      @if (subtitle()) {
        <span class="ah-muted">{{ subtitle() }}</span>
      }
      <ng-content />
      <div class="ah-panel__actions"><ng-content select="[ahPanelActions]" /></div>
    </div>
  `,
})
export class PanelHead {
  /** The panel title (`section-title`, 15px bold). */
  readonly heading = input("");
  /** Muted text after the title, such as a count or a key. */
  readonly subtitle = input("");
  /** The heading level; 2 unless the panel sits under another section heading. */
  readonly level = input<2 | 3>(2);

  protected readonly titleId = inject(Panel, { optional: true })?.titleId ?? `ah-panel-${nextPanelId++}-title`;
}

/** The panel body: 14 × 16px padding, children stacked with a 12px gap. */
@Component({
  selector: "ah-panel-body",
  template: `<div class="ah-panel__body"><ng-content /></div>`,
})
export class PanelBody {}

/** The panel footer: content spread across, usually a hint on the left and the action on the right. */
@Component({
  selector: "ah-panel-foot",
  template: `<div class="ah-panel__foot"><ng-content /></div>`,
})
export class PanelFoot {}
