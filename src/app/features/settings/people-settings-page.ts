import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { map } from 'rxjs';
import type { ApiError, ApiResult } from '@core/api/api-error';
import type { Member, MemberRole, PeoplePage } from '@core/api/types';
import { qnumberOf, roleLabel } from '@domain/people-settings';
import { absoluteDayTime } from '@domain/time';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Field, FieldControl } from '@ui/field/field';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { Skeleton } from '@ui/skeleton/skeleton';
import { Table } from '@ui/table/table';
import { ToastService } from '@ui/toast/toast';
import { PeopleSettingsStore } from './people-settings-store';
import { SECTION_STYLES } from './section-styles';
import { settingsErrorView } from './settings-errors';
import { SettingsHistory } from './settings-history';

/**
 * Team settings › People (`ahoy-hosted` design D23): who may use Ahoy and who is an admin. The deployment's own people
 * (`AHOY_ALLOWED_QNUMBERS`, `AHOY_ADMIN_QNUMBERS`) are listed read-only, since they change only in the chart; an admin
 * adds members, changes their role or removes them, never their own row. A change reaches every replica of the API
 * within 30 seconds.
 */
@Component({
  selector: 'ah-people-settings-page',
  imports: [
    Banner,
    Button,
    EmptyState,
    Field,
    FieldControl,
    Panel,
    PanelBody,
    PanelHead,
    ReactiveFormsModule,
    SettingsHistory,
    Skeleton,
    Table,
  ],
  providers: [PeopleSettingsStore],
  styles: [
    SECTION_STYLES,
    `
      .add {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 12px;
      }
      .add > ah-field:first-child {
        flex: 1 1 220px;
        max-width: 320px;
      }
      .actions {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      .scroll {
        overflow-x: auto;
      }
    `,
  ],
  template: `
    <div class="head">
      <h2>People</h2>
      <span class="ah-muted"
        >Who may use Ahoy, and who is an admin and may change the team
        settings.</span
      >
    </div>

    @if (failure(); as problem) {
      <ah-banner
        [variant]="problem.variant"
        [heading]="problem.heading"
        [tech]="problem.tech ?? ''"
      >
        {{ problem.text }}
        <button ahButton size="sm" type="button" (click)="store.load()">
          Try again
        </button>
      </ah-banner>
    }

    @if (store.loading() && !store.page()) {
      <div
        class="ah-panel loading"
        role="status"
        aria-label="Loading the people"
      >
        <ah-skeleton width="40%" />
        <ah-skeleton width="70%" />
      </div>
    } @else if (store.page(); as page) {
      @if (!page.canEdit) {
        <ah-banner variant="info" heading="Only admins change these">
          You can see who may use Ahoy. Ask an admin to add someone or make them
          an admin.
        </ah-banner>
      }

      <div class="layout">
        <div class="main">
          <ah-panel>
            <ah-panel-head
              heading="Added in Ahoy"
              subtitle="A change reaches every Ahoy server within 30 seconds."
            />
            <ah-panel-body>
              @if (store.canEdit()) {
                <form class="add" [formGroup]="form" (ngSubmit)="add()">
                  <ah-field
                    label="Qnumber"
                    hint="They sign in with WebEAM as usual."
                    [errorText]="qnumberError() ?? ''"
                  >
                    <input
                      ahInput
                      type="text"
                      autocomplete="off"
                      spellcheck="false"
                      maxlength="63"
                      [formControl]="form.controls.qnumber"
                    />
                  </ah-field>
                  <ah-field label="Role">
                    <select ahInput [formControl]="form.controls.role">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </ah-field>
                  <button
                    ahButton="primary"
                    type="submit"
                    [disabled]="busy() || !typed() || qnumberError() !== null"
                  >
                    Add
                  </button>
                </form>
              }
              @if (failureOfChange(); as problem) {
                <ah-banner
                  [variant]="problem.variant"
                  [heading]="problem.heading"
                  [tech]="problem.tech ?? ''"
                >
                  {{ problem.text }}
                </ah-banner>
              }
              @if (page.members.length === 0) {
                <ah-empty-state heading="Nobody added yet" icon="lock">
                  Only the deployment's people below use Ahoy.
                </ah-empty-state>
              } @else {
                <div class="scroll">
                  <table ahTable aria-label="People added in Ahoy">
                    <thead>
                      <tr>
                        <th scope="col">Person</th>
                        <th scope="col">Role</th>
                        <th scope="col">Added</th>
                        @if (store.canEdit()) {
                          <th scope="col">
                            <span class="ah-sr">Actions</span>
                          </th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (m of page.members; track m.qnumber) {
                        <tr>
                          <th scope="row">
                            {{ m.name ?? m.qnumber }}
                            @if (m.name !== null) {
                              <span class="ah-cell-sub ah-mono">{{
                                m.qnumber
                              }}</span>
                            }
                            @if (m.qnumber === page.you) {
                              <span class="ah-tag">You</span>
                            }
                          </th>
                          <td>{{ role(m.role) }}</td>
                          <td>
                            {{ m.addedByName ?? m.addedBy }}
                            <span class="ah-cell-sub">{{
                              moment(m.addedAt)
                            }}</span>
                          </td>
                          @if (store.canEdit()) {
                            <td>
                              @if (m.qnumber === page.you) {
                                <span class="ah-muted"
                                  >Another admin changes your row</span
                                >
                              } @else if (removing() === m.qnumber) {
                                <span class="actions">
                                  <button
                                    ahButton
                                    size="sm"
                                    type="button"
                                    [disabled]="busy()"
                                    (click)="remove(m)"
                                  >
                                    Remove {{ m.qnumber }}
                                  </button>
                                  <button
                                    ahButton="ghost"
                                    size="sm"
                                    type="button"
                                    [disabled]="busy()"
                                    (click)="removing.set(null)"
                                  >
                                    Keep
                                  </button>
                                </span>
                              } @else {
                                <span class="actions">
                                  <button
                                    ahButton="ghost"
                                    size="sm"
                                    type="button"
                                    [disabled]="busy()"
                                    [attr.aria-label]="
                                      (m.role === 'admin'
                                        ? 'Make a member: '
                                        : 'Make an admin: ') + m.qnumber
                                    "
                                    (click)="toggle(m)"
                                  >
                                    {{
                                      m.role === 'admin'
                                        ? 'Make member'
                                        : 'Make admin'
                                    }}
                                  </button>
                                  <button
                                    ahButton="ghost"
                                    size="sm"
                                    type="button"
                                    [disabled]="busy()"
                                    [attr.aria-label]="'Remove ' + m.qnumber"
                                    (click)="removing.set(m.qnumber)"
                                  >
                                    Remove
                                  </button>
                                </span>
                              }
                            </td>
                          }
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </ah-panel-body>
          </ah-panel>

          <ah-panel>
            <ah-panel-head
              heading="Set by the deployment"
              subtitle="AHOY_ALLOWED_QNUMBERS and AHOY_ADMIN_QNUMBERS: they change only in the chart, so the team never loses them here."
            />
            <ah-panel-body>
              @if (page.everyoneAllowed) {
                <p class="ah-muted">
                  This deployment lets everyone in (local development).
                  {{
                    page.everyoneAdmin
                      ? 'Everyone is an admin too.'
                      : 'The admins are listed below.'
                  }}
                </p>
              }
              @if (page.deployment.length > 0) {
                <div class="scroll">
                  <table ahTable aria-label="People set by the deployment">
                    <thead>
                      <tr>
                        <th scope="col">Person</th>
                        <th scope="col">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (p of page.deployment; track p.qnumber) {
                        <tr>
                          <th scope="row">
                            {{ p.name ?? p.qnumber }}
                            @if (p.name !== null) {
                              <span class="ah-cell-sub ah-mono">{{
                                p.qnumber
                              }}</span>
                            }
                            @if (p.qnumber === page.you) {
                              <span class="ah-tag">You</span>
                            }
                          </th>
                          <td>{{ role(p.role) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </ah-panel-body>
          </ah-panel>
        </div>

        <aside class="side">
          <ah-settings-history
            section="People"
            [events]="store.history()"
            [error]="store.historyError()"
            footnote="Kept for good."
          />
        </aside>
      </div>
    }
  `,
})
export class PeopleSettingsPage {
  protected readonly store = inject(PeopleSettingsStore);
  private readonly toasts = inject(ToastService);
  private readonly now = new Date();

  /** Who to add, and with which role. */
  protected readonly form = new FormGroup({
    qnumber: new FormControl('', { nonNullable: true }),
    role: new FormControl<MemberRole>('member', { nonNullable: true }),
  });
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() }
  );
  /** Whether a qnumber is typed: an empty box shows no error. */
  protected readonly typed = computed(() => this.value().qnumber.trim() !== '');
  protected readonly qnumberError = computed(() => {
    if (!this.typed()) return null;
    const read = qnumberOf(this.value().qnumber);
    if ('problem' in read) return read.problem;
    return this.listed(read.value);
  });
  /** The member whose removal waits for a second click. */
  protected readonly removing = signal<string | null>(null);
  protected readonly busy = signal(false);
  private readonly changeError = signal<ApiError | null>(null);
  protected readonly failureOfChange = computed(() => {
    const error = this.changeError();
    return error === null ? null : settingsErrorView(error);
  });
  protected readonly failure = computed(() => {
    const error = this.store.loadError();
    return error === null ? null : settingsErrorView(error, 'read');
  });

  constructor() {
    void this.store.load();
  }

  /** "Admin" or "Member". */
  protected role(role: MemberRole): string {
    return roleLabel(role);
  }

  /** The day and time of a change. */
  protected moment(at: string): string {
    return absoluteDayTime(at, this.now);
  }

  /** Why a qnumber cannot be added: it is already listed, here or by the deployment; or null. */
  private listed(qnumber: string): string | null {
    const page: PeoplePage | null = this.store.page();
    if (page === null) return null;
    if (page.deployment.some((p) => p.qnumber === qnumber))
      return 'The deployment already lets them in.';
    if (page.members.some((m) => m.qnumber === qnumber))
      return 'Already added: change their role in the list.';
    return null;
  }

  /** Adds the qnumber typed, with the role chosen. */
  protected async add(): Promise<void> {
    const read = qnumberOf(this.form.getRawValue().qnumber);
    if (this.busy() || 'problem' in read || this.qnumberError() !== null)
      return;
    const role = this.form.getRawValue().role;
    const done = await this.run(this.store.put(read.value, role));
    if (!done) return;
    this.form.reset({ qnumber: '', role: 'member' });
    this.toasts.show(
      role === 'admin'
        ? `${read.value} added as an admin.`
        : `${read.value} added.`
    );
  }

  /** Makes a member an admin, or an admin a member. */
  protected async toggle(member: Member): Promise<void> {
    const role: MemberRole = member.role === 'admin' ? 'member' : 'admin';
    if (await this.run(this.store.put(member.qnumber, role)))
      this.toasts.show(
        `${member.qnumber} is now ${role === 'admin' ? 'an admin' : 'a member'}.`
      );
  }

  /** Removes a member, after the second click. */
  protected async remove(member: Member): Promise<void> {
    if (await this.run(this.store.remove(member.qnumber))) {
      this.removing.set(null);
      this.toasts.show(`${member.qnumber} removed.`);
    }
  }

  /** Sends a change, showing why it was refused; true when it was made. */
  private async run(request: Promise<ApiResult<PeoplePage>>): Promise<boolean> {
    this.busy.set(true);
    this.changeError.set(null);
    const result = await request;
    this.busy.set(false);
    if (!result.ok) this.changeError.set(result.error);
    return result.ok;
  }
}
