import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiClient } from '@core/api/api-client';
import type { ApiError } from '@core/api/api-error';
import {
  STORY_STATUSES,
  type Defect,
  type DefectList,
  type StoryStatus,
} from '@core/api/types';
import { defectTriageView, defectsLabel } from '@domain/defects';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { Skeleton } from '@ui/skeleton/skeleton';
import { StatusBadge } from '@ui/status-badge/status-badge';
import { Api, Key, Nowrap, Table } from '@ui/table/table';
import { ToastService } from '@ui/toast/toast';

/** What the list holds: being read, read, or why it could not be. */
type ListState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly list: DefectList }
  | { readonly kind: 'failed'; readonly error: ApiError };

/** The technical line of an error, for a banner. */
function techOf(error: ApiError): string {
  if (error.kind === 'problem')
    return `${error.status} ${error.code}${error.detail ? `: ${error.detail}` : ''}`;
  return error.kind === 'network' ? 'network' : error.what;
}

/**
 * Backlog › Defects (`ahoy-hosted` design §5 "Defect watch"): the open defects the watch read from Jira on its last
 * pass, each with its triage by fixed rules (0 AIU) and its voyage if it has one. A person may ignore a defect, which
 * writes nothing to Jira, and undo it. Nothing here starts a voyage.
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
    Api,
  ],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .defects__head {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: baseline;
      padding: 14px 16px 0;
    }
    .defects__head h2 {
      margin: 0;
      font-size: 16px;
    }
    .defects__sub {
      display: block;
      margin-top: 4px;
      font-size: 12px;
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
          } @else if (list.lastPass?.error; as error) {
            <ah-banner
              variant="notice"
              heading="Could not read Jira on the last check"
              [tech]="error"
            >
              The list keeps what it last read; the watch tries again in 15
              minutes.
            </ah-banner>
          }
          @if (actionError(); as failure) {
            <ah-banner
              variant="error"
              [heading]="failure.heading"
              [tech]="tech(failure.error)"
            >
              Nothing changed. Try again.
            </ah-banner>
          }

          @if (list.defects.length === 0) {
            <ah-empty-state heading="No open defects" icon="compass">
              @if (list.watchOn && list.lastPass === null) {
                The watch has not read Jira yet; it does every 15 minutes.
              } @else {
                The defects query matched none on the last check.
              }
            </ah-empty-state>
          } @else {
            <section class="ah-panel" aria-label="Defects">
              <div class="defects__head">
                <h2>Defects</h2>
                <span class="ah-muted"
                  >{{ countLabel(list.defects.length) }}, the latest first.
                  Triage runs fixed rules and spends nothing.</span
                >
                @if (list.lastPass; as pass) {
                  <span class="ah-muted"
                    >Last check {{ pass.checkedAt | ahRelative }}</span
                  >
                }
              </div>
              <table ahTable aria-label="Open defects">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Summary</th>
                    <th>Priority</th>
                    <th>Component</th>
                    <th>Seen</th>
                    <th>Triage</th>
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
                        <span ahApi>{{
                          defect.components.length === 0
                            ? '—'
                            : defect.components.join(' + ')
                        }}</span>
                      </td>
                      <td ahNowrap data-label="Seen">
                        {{ defect.firstSeenAt | ahRelative }}
                      </td>
                      <td data-label="Triage">
                        @let view = triage(defect);
                        <span
                          [class]="
                            view.tone === 'fit'
                              ? 'ah-tag ah-tag--accent'
                              : view.tone === 'ignored'
                                ? 'ah-tag ah-tag--outline'
                                : 'ah-tag'
                          "
                          >{{ view.label }}</span
                        >&ngsp;
                        <span class="ah-muted defects__sub">{{
                          view.detail
                        }}</span>
                      </td>
                      <td ahNowrap data-label="Ahoy">
                        @if (defect.voyage; as voyage) {
                          <a [routerLink]="['/voyages', defect.key]">
                            @if (storyStatus(voyage.status); as status) {
                              <ah-status-badge
                                [status]="status"
                                [phase]="voyage.phase"
                              />&ngsp;
                            } @else {
                              <span ahApi>{{ voyage.status }}</span
                              >&ngsp;
                            }
                            @if (voyage.phase) {
                              <span ahApi>{{ voyage.phase }}</span>
                            }
                          </a>
                        } @else if (defect.ignored) {
                          <span class="ah-tag ah-tag--outline">Ignored</span>
                        } @else {
                          <span class="ah-tag ah-tag--outline"
                            >Not started</span
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
  } | null>(null);

  constructor() {
    void this.load();
  }

  /** Reads the list again. */
  async load(): Promise<void> {
    if (this.state().kind !== 'ready') this.state.set({ kind: 'loading' });
    const result = await this.api.listDefects();
    this.state.set(
      result.ok
        ? { kind: 'ready', list: result.value }
        : { kind: 'failed', error: result.error }
    );
  }

  protected triage(defect: Defect) {
    return defectTriageView(defect);
  }

  protected countLabel(n: number): string {
    return defectsLabel(n);
  }

  protected tech(error: ApiError): string {
    return techOf(error);
  }

  /** The voyage's status as the badge knows it, or null for a word this version does not. */
  protected storyStatus(status: string): StoryStatus | null {
    return STORY_STATUSES.find((s) => s === status) ?? null;
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
      this.actionError.set({ heading, error: result.error });
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
