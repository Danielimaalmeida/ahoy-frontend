import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiClient } from '@core/api/api-client';
import type { ApiError } from '@core/api/api-error';
import type { PlanPanel } from '@core/api/types';
import { apiErrorView } from '@core/commands/command-error';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { Markdown } from '@ui/markdown/markdown';
import { OutcomePill } from '@ui/outcome-pill/outcome-pill';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { Skeleton } from '@ui/skeleton/skeleton';
import { VoyageContext } from '../../context/voyage-context';
import { panelView, type DraftCard, type PanelView } from './plan-panel-view';

/** The plan of each draft of one panel run, read when a person first opens a draft. */
type Detail =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: ApiError }
  | {
      readonly status: 'ready';
      /** The draft's markdown by label; null for a planner that wrote none. */
      readonly plans: ReadonlyMap<string, string | null>;
    };

/**
 * "Plan panel" (design §4 of `ahoy-hosted`): when the voyage was planned by a panel, what the planners drafted and how
 * the judge rated them: the judge's model and summary, one card per draft (planner, how it ended, the plan gate's
 * verdict, the cost, the score out of 10 as text and a bar, the judge's reasons, what it adopted and left out, the
 * planner's questions), and each draft's plan on demand. The latest panel run shows first; earlier ones (a re-plan) are
 * in the selector. It reads again whenever the voyage's planning runs change, so a panel shows when its run finishes.
 *
 * Everything an agent wrote (reasons, summary, errors, questions, gate messages, plans) is untrusted: it is shown as
 * text, and a draft's plan only through `ah-markdown`. A voyage planned by one planner has none: nothing is shown, and a
 * read that fails leaves what was there.
 */
@Component({
  selector: 'ah-plan-panel-section',
  imports: [
    Banner,
    Button,
    Markdown,
    OutcomePill,
    Panel,
    PanelBody,
    PanelHead,
    RelativePipe,
    RouterLink,
    Skeleton,
  ],
  styles: `
    :host {
      display: contents;
    }
    .panel__select {
      max-width: 220px;
    }
    .panel__judge,
    .panel__summary {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .panel__summary {
      white-space: pre-line;
    }
    .panel__drafts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .draft {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
      padding: var(--space-3);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }
    .draft__head {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1\\.5);
      align-items: baseline;
    }
    .draft__label {
      font-weight: 700;
    }
    .draft__score {
      display: flex;
      gap: var(--space-2);
      align-items: center;
    }
    .draft__bar {
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: var(--surface-sunken);
      overflow: hidden;
    }
    .draft__bar i {
      display: block;
      height: 100%;
      background: var(--accent);
    }
    .draft__facts {
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 4px 10px;
      margin: 0;
    }
    .draft__facts dt {
      color: var(--ink-muted);
    }
    .draft__facts dd {
      margin: 0;
      overflow-wrap: anywhere;
      white-space: pre-line;
    }
    .draft__questions {
      margin: 0;
      padding-left: var(--space-4);
      overflow-wrap: anywhere;
    }
    .draft__plan {
      padding-top: var(--space-2);
      border-top: 1px solid var(--line);
    }
  `,
  template: `
    @if (current(); as v) {
      <ah-panel>
        <ah-panel-head heading="Plan panel" [subtitle]="v.line">
          @if (views().length > 1) {
            <select
              ahPanelActions
              class="ah-input panel__select"
              aria-label="Panel run"
              (change)="choose($event)"
            >
              @for (p of views(); track p.runId; let first = $first) {
                <option [value]="p.runId" [selected]="p.runId === v.runId">
                  {{ first ? 'Latest' : 'Earlier' }} · run {{ p.runId }}
                </option>
              }
            </select>
          }
        </ah-panel-head>
        <ah-panel-body>
          <p class="panel__judge">
            @if (v.judge; as j) {
              <b>Judge</b>&ngsp;<span class="ah-mono">{{ j.model }}</span> ·
              {{ j.effort }} · {{ j.cost }}
            } @else {
              <b>No judge ran.</b> No planner finished, so there was nothing to
              judge.
            }
            · run
            <a [routerLink]="['/voyages', key(), 'runs', v.runId]">{{
              v.runId
            }}</a>
            · {{ v.createdAt | ahRelative }}
          </p>

          @if (v.ratingsProblem; as problem) {
            <ah-banner
              variant="info"
              heading="The judge's ratings could not be used"
              >{{ problem }} No draft has a score.</ah-banner
            >
          }
          @if (v.unfinished.length > 0) {
            <ah-banner
              variant="info"
              [heading]="
                v.unfinished.length +
                (v.unfinished.length === 1
                  ? ' planner did not finish'
                  : ' planners did not finish')
              "
              >The panel went on without
              {{ v.unfinished.length === 1 ? 'its draft' : 'their drafts' }}.
              What each one ran into is on its card.</ah-banner
            >
          }

          <ul class="panel__drafts" aria-label="Drafts, best first">
            @for (c of v.cards; track c.id) {
              <li class="draft">
                <div class="draft__head">
                  <span class="draft__label">Draft {{ c.label }}</span>
                  <span class="ah-mono">{{ c.model }}</span>
                  <span class="ah-muted">· {{ c.effort }}</span>
                  @if (c.best) {
                    <span class="ah-tag">Best draft</span>
                  }
                </div>
                <div class="draft__score">
                  <b>{{ c.scoreText }}</b>
                  <span class="draft__bar" aria-hidden="true"
                    ><i [style.width.%]="c.scoreBar"></i
                  ></span>
                </div>
                <dl class="draft__facts">
                  <dt>Ended</dt>
                  <dd>
                    <span [class]="'ah-badge ah-badge--' + c.statusModifier">{{
                      c.statusLabel
                    }}</span>
                    @if (c.error; as error) {
                      {{ error }}
                    }
                  </dd>
                  <dt>Plan gate</dt>
                  <dd>
                    @if (c.gate; as gate) {
                      <ah-outcome-pill [value]="gate.result" />
                      {{ gate.message }}
                    } @else {
                      Not checked
                    }
                  </dd>
                  <dt>Cost</dt>
                  <dd>{{ c.cost }}</dd>
                  @if (c.rationale; as rationale) {
                    <dt>Judge's reasons</dt>
                    <dd>{{ rationale }}</dd>
                  }
                  @if (c.adopted; as adopted) {
                    <dt>Adopted</dt>
                    <dd>{{ adopted }}</dd>
                  }
                  @if (c.leftOut; as leftOut) {
                    <dt>Left out</dt>
                    <dd>{{ leftOut }}</dd>
                  }
                </dl>
                @if (c.questions.length > 0) {
                  <div>
                    <b>Questions the planner asked</b>
                    <ul class="draft__questions">
                      @for (q of c.questions; track $index) {
                        <li>
                          {{ q.text }}
                          <span class="ah-muted"
                            >Recommended: {{ q.recommendation }}</span
                          >
                        </li>
                      }
                    </ul>
                  </div>
                }
                <div>
                  <button
                    type="button"
                    ahButton
                    size="sm"
                    [attr.aria-expanded]="isOpen(c)"
                    [attr.aria-controls]="planId(c)"
                    (click)="toggle(v.runId, c)"
                  >
                    {{ isOpen(c) ? 'Hide draft plan' : 'Show draft plan' }}
                  </button>
                </div>
                @if (isOpen(c)) {
                  <div class="draft__plan" [id]="planId(c)">
                    @switch (detailOf(v.runId)?.status) {
                      @case ('ready') {
                        @if (planOf(v.runId, c); as plan) {
                          <ah-markdown [source]="plan" />
                        } @else {
                          <p class="ah-muted">
                            Planner {{ c.label }} wrote no plan.
                          </p>
                        }
                      }
                      @case ('error') {
                        @if (detailError(v.runId); as e) {
                          <ah-banner
                            [variant]="e.variant"
                            [heading]="e.heading"
                            [tech]="e.tech ?? ''"
                            >{{ e.text }}
                            <button
                              type="button"
                              ahButton
                              size="sm"
                              (click)="retry(v.runId)"
                            >
                              Try again
                            </button></ah-banner
                          >
                        }
                      }
                      @default {
                        <div aria-busy="true">
                          <span class="ah-sr" role="status"
                            >Loading the draft…</span
                          >
                          <ah-skeleton width="90%" />
                          <ah-skeleton width="70%" />
                        </div>
                      }
                    }
                  </div>
                }
              </li>
            }
          </ul>

          @if (v.summary; as summary) {
            <div>
              <b>How the judge built the final plan</b>
              <p class="panel__summary">{{ summary }}</p>
            </div>
          }
        </ah-panel-body>
      </ah-panel>
    }
  `,
})
export class PlanPanelSection {
  private readonly api = inject(ApiClient);
  private readonly context = inject(VoyageContext);
  private disposed = false;
  /** Counts reads, so that the answer to a read that was replaced meanwhile is dropped. */
  private generation = 0;

  /** The panels last read, with the voyage they are of. */
  private readonly read = signal<{
    readonly key: string;
    readonly panels: readonly PlanPanel[];
  } | null>(null);
  private readonly selected = signal<string | null>(null);
  private readonly open = signal<ReadonlySet<string>>(new Set());
  private readonly details = signal<ReadonlyMap<string, Detail>>(new Map());

  protected readonly key = computed(() => this.context.key() ?? '');

  /** The voyage's panel runs, newest first; none for a voyage planned by one planner. */
  protected readonly views = computed((): readonly PanelView[] => {
    const read = this.read();
    return read !== null && read.key === this.context.key()
      ? read.panels.map(panelView)
      : [];
  });

  /** The panel run on show: the one chosen, else the latest. */
  protected readonly current = computed(() => {
    const views = this.views();
    return views.find((v) => v.runId === this.selected()) ?? views[0] ?? null;
  });

  /**
   * What makes a new read worth it: the voyage, and its planning runs with how they stand, since a panel is written when
   * its run finishes. Nothing is read until the runs are, so a voyage is read once, not twice.
   */
  private readonly trigger = computed(
    () => {
      const runs = this.context.handle()?.runs;
      const ready = runs?.value() !== undefined || runs?.status() === 'error';
      return {
        key: this.context.key(),
        ready,
        planning: this.context
          .runs()
          .filter((run) => run.phase === 'planning')
          .map((run) => `${run.id}:${run.status}`)
          .join('|'),
      };
    },
    {
      equal: (a, b) =>
        a.key === b.key && a.ready === b.ready && a.planning === b.planning,
    }
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.disposed = true));
    effect(() => {
      const { key, ready } = this.trigger();
      if (key === null || !ready) return;
      untracked(() => void this.load(key));
    });
  }

  protected choose(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement) this.selected.set(select.value);
  }

  protected isOpen(card: DraftCard): boolean {
    return this.open().has(card.id);
  }

  protected planId(card: DraftCard): string {
    return `plan-draft-${card.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  }

  /** Opens or closes a draft's plan; the first one opened reads the run's plans. */
  protected toggle(runId: string, card: DraftCard): void {
    const next = new Set(this.open());
    if (next.has(card.id)) next.delete(card.id);
    else {
      next.add(card.id);
      const detail = this.details().get(runId);
      if (detail === undefined || detail.status === 'error')
        void this.loadDetail(runId);
    }
    this.open.set(next);
  }

  protected retry(runId: string): void {
    void this.loadDetail(runId);
  }

  protected detailOf(runId: string): Detail | undefined {
    return this.details().get(runId);
  }

  protected detailError(runId: string) {
    const detail = this.details().get(runId);
    return detail?.status === 'error' ? apiErrorView(detail.error) : null;
  }

  /** A draft's plan once read; null when the planner wrote none (or it is not read yet). */
  protected planOf(runId: string, card: DraftCard): string | null {
    const detail = this.details().get(runId);
    return detail?.status === 'ready'
      ? (detail.plans.get(card.label) ?? null)
      : null;
  }

  private async load(key: string): Promise<void> {
    const generation = ++this.generation;
    const result = await this.api.listStoryPlanPanels(key);
    if (this.disposed || generation !== this.generation || !result.ok) return;
    if (this.read()?.key !== key) {
      this.selected.set(null);
      this.open.set(new Set());
      this.details.set(new Map());
    }
    this.read.set({ key, panels: result.value });
  }

  private async loadDetail(runId: string): Promise<void> {
    this.setDetail(runId, { status: 'loading' });
    const result = await this.api.getRunPlanPanel(runId);
    if (this.disposed) return;
    this.setDetail(
      runId,
      result.ok
        ? {
            status: 'ready',
            plans: new Map(
              result.value.members.map((m) => [m.label, m.plan ?? null])
            ),
          }
        : { status: 'error', error: result.error }
    );
  }

  private setDetail(runId: string, detail: Detail): void {
    this.details.update((all) => new Map(all).set(runId, detail));
  }
}
