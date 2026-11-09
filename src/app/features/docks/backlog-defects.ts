import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiClient } from '@core/api/api-client';
import { isInvalidState, isNotFound, type ApiError } from '@core/api/api-error';
import {
  STORY_STATUSES,
  type Defect,
  type DefectList,
  type StoryStatus,
} from '@core/api/types';
import { techLine } from '@core/commands/command-error';
import {
  canTryToFix,
  defectStartLine,
  defectTriageView,
  defectsLabel,
} from '@domain/defects';
import { phaseName } from '@domain/phase-settings';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { Skeleton } from '@ui/skeleton/skeleton';
import { StatusBadge } from '@ui/status-badge/status-badge';
import { CellSub, Key, Nowrap, Table } from '@ui/table/table';
import { ToastService } from '@ui/toast/toast';
import { TryToFixDialogs } from './try-to-fix-dialog';

/** What the list holds: being read, read, or why it could not be. */
type ListState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly list: DefectList }
  | { readonly kind: 'failed'; readonly error: ApiError };

/**
 * Backlog › Defects (`ahoy-hosted` design §5 "Defect watch"): the open defects the watch read from Jira on its last
 * pass, each with its triage by fixed rules (0 AIU), its voyage if it has one and who started it (a person, or the
 * watch itself when Team settings › Defects turns automatic starts on). A person may Try to fix a defect, which starts
 * its voyage, or ignore it, which writes nothing to Jira, and undo that.
 */
@Component({
  selector: 'ah-backlog-defects',
  imports: [
    RouterLink,
    Banner,
    Button,
    EmptyState,
    RelativePipe,
    Skeleton,
    StatusBadge,
    Table,
    Nowrap,
    Key,
    CellSub,
  ],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .defects__table td {
      vertical-align: top;
      padding-top: 10px;
      padding-bottom: 10px;
    }
    .defects__table .ah-cell-sub {
      margin-top: 4px;
      line-height: 1.4;
    }
    .defects__summary {
      width: 30%;
    }
    .defects__component {
      min-width: 140px;
    }
    .defects__triage {
      width: 22%;
    }
    .defects__voyage {
      display: inline-flex;
      text-decoration: none;
    }
    .defects__tag--fit {
      background: var(--status-done-bg);
      color: var(--status-done-fg);
    }
    .defects__failed {
      color: var(--danger-text);
      white-space: normal;
    }
    .defects__actions {
      text-align: right;
    }
    .defects__actions > * + * {
      margin-left: 6px;
    }
  `,
  template: `
    @switch (state().kind) {
      @case ('loading') {
        <div
          class="ah-panel ah-panel__body"
          role="status"
          aria-label="Loading the defects"
        >
          <ah-skeleton width="40%" />
          <ah-skeleton width="70%" />
        </div>
      }
      @case ('failed') {
        @if (loadError(); as error) {
          <ah-banner
            variant="error"
            heading="Could not read the defects"
            [tech]="tech(error)"
          >
            Nothing you did is lost.
            <button ahButton size="sm" type="button" (click)="load()">
              Try again
            </button>
          </ah-banner>
        }
      }
      @case ('ready') {
        @if (list(); as list) {
          @if (!list.watchOn) {
            <ah-banner
              variant="info"
              heading="The defect watch is off"
              announce="off"
            >
              Ahoy reads no defects from Jira until an admin turns it on in
              <a routerLink="/settings/defects">Team settings › Defects</a>.
              @if (list.defects.length > 0) {
                The list keeps what it last read.
              }
            </ah-banner>
          } @else {
            @if (list.lastPass?.error; as error) {
              <ah-banner
                variant="notice"
                heading="Could not read Jira on the last check"
                [tech]="error"
              >
                The list keeps what it last read; the watch tries again in 15
                minutes.
              </ah-banner>
            }
            @if (autoStart() === false) {
              <ah-banner
                variant="info"
                heading="Ahoy starts no defect by itself"
                announce="off"
              >
                Use Try to fix to start one, or ask an admin to turn on
                automatic starts in
                <a routerLink="/settings/defects">Team settings › Defects</a>.
              </ah-banner>
            }
          }
          @if (actionError(); as failure) {
            <ah-banner
              variant="error"
              [heading]="failure.heading"
              [tech]="tech(failure.error)"
            >
              {{
                failure.reread
                  ? 'Someone changed it first, or the watch no longer lists it: the list was read again.'
                  : 'Nothing changed. Try again.'
              }}
            </ah-banner>
          }

          @if (list.defects.length === 0) {
            <ah-empty-state heading="No open defects" icon="compass">
              @if (list.lastPass === null) {
                @if (list.watchOn) {
                  The watch has not read Jira yet; it does every 15 minutes.
                } @else {
                  The watch has never read Jira.
                }
              } @else if (list.lastPass.error === null) {
                The defects query matched none on the last check.
              } @else {
                Nothing was read before the check that failed.
              }
            </ah-empty-state>
          } @else {
            <section class="ah-panel" aria-label="Defects">
              <div class="ah-panel__head">
                <h2 class="ah-panel__title">Defects</h2>
                <span class="ah-muted"
                  >{{ countLabel(list.defects.length) }}, the latest first
                  @if (list.lastPass; as pass) {
                    · last check {{ pass.checkedAt | ahRelative }}
                  }
                </span>
              </div>
              <table ahTable class="defects__table" aria-label="Open defects">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th class="defects__summary">Summary</th>
                    <th>Priority</th>
                    <th class="defects__component">Component</th>
                    <th>Seen</th>
                    <th
                      class="defects__triage"
                      title="Fixed rules, no AIU spent"
                    >
                      Triage
                    </th>
                    <th>Ahoy</th>
                    <th class="defects__actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (defect of list.defects; track defect.key) {
                    <tr>
                      <td ahNowrap data-label="Key">
                        <span ahKey>{{ defect.key }}</span>
                      </td>
                      <td data-label="Summary">{{ defect.summary }}</td>
                      <td ahNowrap data-label="Priority">
                        {{ defect.priority ?? '—' }}
                      </td>
                      <td data-label="Component">
                        {{
                          defect.components.length === 0
                            ? '—'
                            : defect.components.join(', ')
                        }}
                      </td>
                      <td ahNowrap data-label="Seen">
                        {{ defect.firstSeenAt | ahRelative }}
                      </td>
                      <td data-label="Triage">
                        @let view = triage(defect);
                        <span
                          [class]="
                            view.tone === 'fit'
                              ? 'ah-tag defects__tag--fit'
                              : view.tone === 'ignored'
                                ? 'ah-tag ah-tag--outline'
                                : 'ah-tag'
                          "
                          >{{ view.label }}</span
                        >
                        @if (view.detail) {
                          &ngsp;<span ahCellSub>{{ view.detail }}</span>
                        }
                      </td>
                      <td ahNowrap data-label="Ahoy">
                        @if (defect.voyage; as voyage) {
                          <a
                            class="defects__voyage"
                            [routerLink]="['/voyages', defect.key]"
                          >
                            @if (storyStatus(voyage.status); as status) {
                              <ah-status-badge
                                [status]="status"
                                [phase]="voyage.phase"
                              />
                            } @else {
                              <span class="ah-tag">{{ voyage.status }}</span>
                            }
                          </a>
                        } @else if (defect.ignored) {
                          <span class="ah-muted" aria-label="Ignored">—</span>
                        } @else {
                          <span class="ah-tag ah-tag--outline"
                            >Not started</span
                          >
                        }
                        @if (voyageLine(defect); as line) {
                          &ngsp;<span
                            ahCellSub
                            [class.defects__failed]="line.failed"
                            >{{ line.text }}</span
                          >
                        }
                      </td>
                      <td ahNowrap class="defects__actions">
                        @if (defect.voyage) {
                          <a
                            ahButton="soft"
                            size="sm"
                            [routerLink]="['/voyages', defect.key]"
                            >Open voyage</a
                          >
                        } @else if (defect.ignored) {
                          <button
                            ahButton="ghost"
                            size="sm"
                            type="button"
                            [disabled]="busy() !== null"
                            [attr.aria-label]="'Undo ignoring ' + defect.key"
                            (click)="unignore(defect)"
                          >
                            {{ busy() === defect.key ? 'Undoing…' : 'Undo' }}
                          </button>
                        } @else {
                          @if (tryable(defect)) {
                            <button
                              ahButton="soft"
                              size="sm"
                              type="button"
                              [disabled]="busy() !== null"
                              [attr.aria-label]="'Try to fix ' + defect.key"
                              (click)="tryToFix(defect)"
                            >
                              Try to fix
                            </button>
                          }
                          <button
                            ahButton="ghost"
                            size="sm"
                            type="button"
                            [disabled]="busy() !== null"
                            [attr.aria-label]="'Ignore ' + defect.key"
                            (click)="ignore(defect)"
                          >
                            {{ busy() === defect.key ? 'Ignoring…' : 'Ignore' }}
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>
          }
        }
      }
    }
  `,
})
export class BacklogDefects {
  private readonly api = inject(ApiClient);
  private readonly toasts = inject(ToastService);
  private readonly tryDialogs = inject(TryToFixDialogs);
  private readonly router = inject(Router);
  /** Team settings › Defects as read with the list: the cap Try to fix starts at, and whether the watch starts any. */
  private readonly settings = signal<{
    readonly autoStart: boolean;
    readonly budgetNanoAiu: number | null;
  } | null>(null);
  /** Whether the watch starts defects by itself; null while the settings are unknown. */
  protected readonly autoStart = computed(
    () => this.settings()?.autoStart ?? null
  );

  protected readonly state = signal<ListState>({ kind: 'loading' });
  protected readonly list = computed(() => {
    const s = this.state();
    return s.kind === 'ready' ? s.list : null;
  });
  protected readonly loadError = computed(() => {
    const s = this.state();
    return s.kind === 'failed' ? s.error : null;
  });
  /** The key of the defect being ignored or brought back, if any: one at a time. */
  protected readonly busy = signal<string | null>(null);
  protected readonly actionError = signal<{
    readonly heading: string;
    readonly error: ApiError;
    readonly reread: boolean;
  } | null>(null);

  constructor() {
    void this.load();
  }

  /** Reads the list again, and the settings beside it: each shows as soon as it is read. */
  async load(): Promise<void> {
    if (this.state().kind !== 'ready') this.state.set({ kind: 'loading' });
    await Promise.all([this.loadList(), this.loadSettings()]);
  }

  private async loadList(): Promise<void> {
    const result = await this.api.listDefects();
    this.state.set(
      result.ok
        ? { kind: 'ready', list: result.value }
        : { kind: 'failed', error: result.error }
    );
  }

  /** Without the settings the tab still works: Try to fix asks for a cap, and no banner says what the watch starts. */
  private async loadSettings(): Promise<void> {
    const settings = await this.api.getDefectSettings();
    this.settings.set(
      settings.ok
        ? {
            autoStart: settings.value.defects.autoStart,
            budgetNanoAiu: settings.value.defects.budgetNanoAiu,
          }
        : null
    );
  }

  protected triage(defect: Defect) {
    return defectTriageView(defect);
  }

  protected countLabel(n: number): string {
    return defectsLabel(n);
  }

  protected tech(error: ApiError): string {
    return techLine(error);
  }

  /** The voyage's status as the badge knows it, or null for a word this version does not. */
  protected storyStatus(status: string): StoryStatus | null {
    return STORY_STATUSES.find((s) => s === status) ?? null;
  }

  /** The line under the Ahoy cell: the voyage's phase and who started it ("Planning · Started by Ahoy"), or why not. */
  protected voyageLine(
    defect: Defect
  ): { readonly text: string; readonly failed: boolean } | null {
    const start = defectStartLine(defect);
    const phase = defect.voyage?.phase ? phaseName(defect.voyage.phase) : null;
    if (phase === null) return start;
    if (start === null) return { text: phase, failed: false };
    return { text: `${phase} · ${start.text}`, failed: start.failed };
  }

  protected tryable(defect: Defect): boolean {
    return canTryToFix(defect);
  }

  /**
   * Try to fix: asks for the voyage's AIU cap, starts it, and opens it. Closed without a voyage, the list is read
   * again: the dialog may have been refused because someone, or the watch, got there first.
   */
  protected tryToFix(defect: Defect): void {
    if (this.busy() !== null) return;
    const ref = this.tryDialogs.open({
      key: defect.key,
      summary: defect.summary,
      defaultCapNanoAiu: this.settings()?.budgetNanoAiu ?? null,
    });
    ref.closed.subscribe((story) => {
      if (story === undefined) void this.load();
      else void this.router.navigate(['/voyages', story.key]);
    });
  }

  /** Marks the defect as one Ahoy never tries. */
  protected async ignore(defect: Defect): Promise<void> {
    await this.act(defect, `Could not ignore ${defect.key}`, () =>
      this.api.ignoreDefect(defect.key, null)
    );
  }

  /** Undoes "Ignore". */
  protected async unignore(defect: Defect): Promise<void> {
    await this.act(defect, `Could not undo ignoring ${defect.key}`, () =>
      this.api.unignoreDefect(defect.key)
    );
  }

  private async act(
    defect: Defect,
    heading: string,
    call: () => ReturnType<ApiClient['unignoreDefect']>
  ): Promise<void> {
    if (this.busy() !== null) return;
    this.busy.set(defect.key);
    this.actionError.set(null);
    const result = await call();
    this.busy.set(null);
    if (!result.ok) {
      // Someone else ignored or undid it first, or the watch let it go: show the list as it is now.
      const reread = isInvalidState(result.error) || isNotFound(result.error);
      this.actionError.set({ heading, error: result.error, reread });
      if (reread) await this.load();
      return;
    }
    const updated = result.value;
    const list = this.list();
    if (list !== null)
      this.state.set({
        kind: 'ready',
        list: {
          ...list,
          defects: list.defects.map((d) =>
            d.key === updated.key ? updated : d
          ),
        },
      });
    this.toasts.show(
      updated.ignored === null
        ? `${updated.key} is no longer ignored.`
        : `${updated.key} ignored. Ahoy will not try it.`
    );
  }
}
