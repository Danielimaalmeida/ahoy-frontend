import { Directive } from '@angular/core';

/**
 * The dense list table (`ah-table`): wraps instead of scrolling sideways, about 38px rows. Put it straight inside an
 * `ah-panel`; give short cells (badges, dates, buttons, e-mail) `ahNowrap`.
 */
@Directive({ selector: 'table[ahTable]', host: { class: 'ah-table' } })
export class Table {}

/** A table cell that never wraps (`ah-nowrap`); only for short content. */
@Directive({
  selector: 'td[ahNowrap], th[ahNowrap]',
  host: { class: 'ah-nowrap' },
})
export class Nowrap {}

/** An identifier in mono `accent-text` (`ah-key`): a Jira key, run id or question id, usually a link before a title. */
@Directive({ selector: '[ahKey]', host: { class: 'ah-key' } })
export class Key {}

/** The API word next to its friendly label (`ah-api`), in muted mono: `awaiting_decision`, `plan_review`. */
@Directive({ selector: '[ahApi]', host: { class: 'ah-api' } })
export class Api {}

/** Secondary detail under a cell's main text (`ah-cell-sub`), instead of another column. */
@Directive({ selector: '[ahCellSub]', host: { class: 'ah-cell-sub' } })
export class CellSub {}
