import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ownerLabel, shortSha } from '@domain/identifiers';
import { BudgetMeter } from '@ui/budget-meter/budget-meter';
import { Button } from '@ui/button/button';
import { Source } from '@ui/tags/source';
import { PhaseStepper } from '@ui/phase-stepper/phase-stepper';
import { StatusBadge } from '@ui/status-badge/status-badge';
import { JiraLinks } from '@core/stores/jira-links';
import { currentRunView } from '../context/crew';
import { VoyageContext } from '../context/voyage-context';
import { VoyageDialogs } from '../dialogs/voyage-dialogs';
import { DeployAllButton } from './deploy-all-button';
import { pullRequestLabel } from '../context/pull-requests';
import {
  canRefreshDesign,
  canRefreshIntake,
  headerActions,
  menuItems,
  primaryAction,
  type MenuItemId,
} from './primary-action';

/**
 * The voyage header (wireframes `PlanReview` and `Halted`): the key (a link to the issue in Jira when a Jira is known),
 * status badge with the API words (`awaiting_decision · plan_accepted`, `halted · run_failed`), title, and only two
 * actions in view: the primary action for the status and Release to TEST (while a repository has an open pull request
 * and a release workflow). The rest is under More: Budget, Models, Back to intake (in planning and plan review),
 * Refresh design (with a design read, halted in implementation or review or at the delivery gate, or halted in design
 * after a refresh), then Stop and Cancel voyage apart at the end (`menuItems`); when only one of them applies it is a
 * button of its own. Then the phase stepper and the meta line (owner, budget, current run, revision round, the pull
 * requests the harness opened, agent config). Shown once the story is read. While the voyage is `running`, a bar sweeps
 * along the panel's top edge, the badge's dot pulses and the current phase is ringed.
 */
@Component({
  selector: 'ah-voyage-header',
  host: {
    '(document:click)': 'closeOutside($event)',
  },
  imports: [
    BudgetMeter,
    Button,
    DeployAllButton,
    PhaseStepper,
    RouterLink,
    Source,
    StatusBadge,
  ],
  styleUrl: './voyage-header.scss',
  template: `
    @if (view(); as v) {
      <section
        class="ah-panel header__panel"
        [class.header--running]="v.story.status === 'running'"
        aria-labelledby="voyage-title"
      >
        <div class="ah-panel__body header">
          <div class="header__top">
            <div class="header__name">
              <div class="header__line">
                @if (v.jiraUrl; as url) {
                  <a
                    class="ah-key header__key"
                    [href]="url"
                    target="_blank"
                    rel="noopener noreferrer"
                    [title]="'Open ' + v.story.key + ' in Jira'"
                    [attr.aria-label]="v.story.key + ', open in Jira (new tab)'"
                    >{{ v.story.key }}
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
                      />
                    </svg>
                  </a>
                } @else {
                  <span class="ah-key">{{ v.story.key }}</span>
                }
                <ah-status-badge
                  [status]="v.story.status"
                  [phase]="v.story.phase"
                  showApi
                  pulse
                  [detail]="v.apiDetail"
                />
              </div>
              <h1 id="voyage-title" class="header__title">
                {{ v.story.title ?? v.story.key }}
              </h1>
              @if (v.followUp; as fu) {
                <p class="header__follow-up">
                  Follow-up {{ fu.number }} of
                  <a class="ah-key" [routerLink]="['/voyages', fu.rootKey]">{{
                    fu.rootKey
                  }}</a>
                  @if (fu.source === 'ahoy') {
                    <ah-source>Not in Jira</ah-source>
                  }
                  <span class="ah-muted">{{
                    fu.route === 'fast_path'
                      ? 'straight to implementation'
                      : 'through planning'
                  }}</span>
                </p>
              }
            </div>
            <div class="header__actions">
              @if (v.story.phase === 'blocked') {
                <button
                  type="button"
                  ahButton="primary"
                  (click)="openUnblock()"
                >
                  Unblock
                </button>
              }
              @if (v.primary; as primary) {
                @if (primary.kind === 'tab') {
                  <a
                    ahButton="primary"
                    [routerLink]="['/voyages', v.story.key, primary.tab]"
                    >{{ primary.label }}</a
                  >
                } @else if (primary.kind === 'decide') {
                  <button
                    type="button"
                    ahButton="primary"
                    (click)="goToDecision()"
                  >
                    {{ primary.label }}
                  </button>
                } @else if (primary.kind === 'restart') {
                  <button
                    type="button"
                    ahButton="primary"
                    (click)="openRestart()"
                  >
                    {{ primary.label }}
                  </button>
                } @else {
                  <button
                    type="button"
                    ahButton="primary"
                    (click)="openResume()"
                  >
                    {{ primary.label }}
                  </button>
                }
              }
              <ah-deploy-all-button />
              @if (v.menu.length === 1) {
                @for (item of v.menu; track item.id) {
                  <button
                    type="button"
                    [ahButton]="item.danger ? 'danger-outline' : 'default'"
                    [disabled]="item.disabled"
                    (click)="run(item.id)"
                  >
                    {{ item.label }}
                  </button>
                }
              } @else if (v.menu.length > 1) {
                <span class="header__more">
                  <button
                    type="button"
                    ahButton
                    aria-haspopup="menu"
                    aria-controls="voyage-more"
                    [attr.aria-expanded]="menuOpen()"
                    (click)="toggleMenu()"
                    (keydown.arrowdown)="openMenu($event)"
                  >
                    More
                    <svg
                      class="header__chevron"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  @if (menuOpen()) {
                    <div
                      class="header__menu"
                      role="menu"
                      id="voyage-more"
                      aria-label="More actions"
                    >
                      @for (item of v.menu; track item.id) {
                        @if (item.separated) {
                          <hr class="header__menu-rule" />
                        }
                        <button
                          type="button"
                          role="menuitem"
                          ahButton="ghost"
                          [class.header__menu-danger]="item.danger"
                          [disabled]="item.disabled"
                          (click)="choose(item.id)"
                          (keydown)="menuKey($event)"
                        >
                          {{ item.label }}
                        </button>
                      }
                    </div>
                  }
                </span>
              }
            </div>
          </div>
          <ah-phase-stepper
            [phase]="v.story.phase"
            [status]="v.story.status"
            [stoppedAt]="stoppedAt()"
            live
          />
          <dl class="header__meta">
            <div>
              <dt>Owner · billed</dt>
              <dd [title]="v.story.owner">
                {{ ownerLabel(v.story) }}
                @if (isOwner()) {
                  <span class="ah-hint">(you)</span>
                }
              </dd>
            </div>
            <div class="header__budget">
              <dt>Budget</dt>
              <dd>
                <ah-budget-meter
                  [spentNanoAiu]="v.story.spentNanoAiu"
                  [capNanoAiu]="v.story.budgetNanoAiu"
                  [width]="120"
                />
              </dd>
            </div>
            <div>
              <dt>Current run</dt>
              <dd>
                {{ v.run.prefix }}
                @if (v.run.runId; as runId) {
                  <a
                    class="ah-mono"
                    [routerLink]="['/voyages', v.story.key, 'runs', runId]"
                    >{{ runId }}</a
                  >
                }
                {{ v.run.suffix }}
              </dd>
            </div>
            @if (v.round; as round) {
              <div>
                <dt>Revision round</dt>
                <dd>{{ round }}</dd>
              </div>
            }
            @if (v.lineage; as lineage) {
              <div>
                <dt>Revision rounds · follow-ups</dt>
                <dd>{{ lineage.used }} of {{ lineage.ceiling }}</dd>
              </div>
              @if (lineage.others.length > 0) {
                <div>
                  <dt>Lineage</dt>
                  <dd>
                    <ul class="header__prs">
                      @for (other of lineage.others; track other.key) {
                        <li>
                          <a
                            class="ah-key"
                            [routerLink]="['/voyages', other.key]"
                            >{{ other.key }}</a
                          >
                          <span class="ah-muted">{{ other.status }}</span>
                        </li>
                      }
                    </ul>
                  </dd>
                </div>
              }
            }
            @if (v.pullRequests.length > 0) {
              <div>
                <dt>Pull requests</dt>
                <dd>
                  <ul class="header__prs">
                    @for (pr of v.pullRequests; track pr.url) {
                      <li>
                        <a
                          [href]="pr.url"
                          target="_blank"
                          rel="noopener noreferrer"
                          >{{ pr.label }}</a
                        >
                        @if (pr.state) {
                          <span class="ah-muted">{{ pr.state }}</span>
                        }
                      </li>
                    }
                  </ul>
                </dd>
              </div>
            }
            <div>
              <dt>Agent config</dt>
              <dd>
                <span class="ah-mono ah-muted" [title]="v.story.controlSha">{{
                  v.sha
                }}</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>
    }
  `,
})
export class VoyageHeader {
  private readonly context = inject(VoyageContext);
  private readonly dialogs = inject(VoyageDialogs);
  /** The owner's name, or the q-number while the name is not known; the q-number is the tooltip. */
  protected readonly ownerLabel = ownerLabel;

  protected readonly stoppedAt = this.context.stoppedAt;
  protected readonly isOwner = this.context.isOwner;
  protected readonly modelsReady = computed(
    () => this.context.models() !== null
  );

  private readonly jira = inject(JiraLinks);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Whether the More menu is open. */
  protected readonly menuOpen = signal(false);

  protected readonly view = computed(() => {
    const story = this.context.story();
    if (story === null) return null;
    const gateKey = this.context.gateKey();
    const apiDetail =
      story.status === 'awaiting_decision'
        ? (gateKey ?? '')
        : story.status === 'halted'
          ? (story.haltReason ?? '')
          : '';
    const actions = headerActions(story.status);
    return {
      story,
      apiDetail,
      jiraUrl: this.jira.issueUrl(story.key),
      primary: primaryAction(story.status, gateKey),
      menu: menuItems({
        ...actions,
        halted: story.status === 'halted',
        modelsReady: this.modelsReady(),
        intake: canRefreshIntake(
          story,
          this.context.counts().runs === null ? null : this.context.runs()
        ),
        design: canRefreshDesign(story, this.context.design()),
        startFollowUp: this.context.canStartFollowUp(),
        raiseCeiling: this.ceilingReached(),
      }),
      run: currentRunView(story.currentRunId, this.context.runs()),
      round: this.roundText(),
      followUp: story.followUp ?? null,
      lineage: this.lineageView(story.key),
      pullRequests: (this.context.state()?.pullRequests ?? []).map((pr) => ({
        url: pr.url,
        label: pullRequestLabel(pr),
        state: pr.state?.toLowerCase() ?? null,
      })),
      sha: shortSha(story.controlSha),
    };
  });

  /** The rounds the lineage shares and its other voyages; null while it is not read or the voyage is on its own. */
  private lineageView(key: string): {
    readonly used: number;
    readonly ceiling: number;
    readonly others: readonly {
      readonly key: string;
      readonly status: string;
    }[];
  } | null {
    const lineage = this.context.lineage();
    if (lineage === null) return null;
    const others = lineage.items
      .filter((item) => item.key !== key)
      .map((item) => ({
        key: item.key,
        status: `${item.status} · ${item.phase}`,
      }));
    if (others.length === 0 && lineage.revisions.used === 0) return null;
    return { ...lineage.revisions, others };
  }

  /** Whether the lineage has used all its revision rounds, so that more need a raise of the ceiling. */
  private ceilingReached(): boolean {
    const revisions = this.context.lineage()?.revisions;
    return revisions !== undefined && revisions.used >= revisions.ceiling;
  }

  /** "2 of 4", shown while a gate is open or once a plan has been sent back. */
  private roundText(): string | null {
    const round = this.context.revisionRound();
    const ceiling = this.context.revisionCeiling();
    if (round === null || ceiling === null) return null;
    return this.context.gateKey() !== null || round > 1
      ? `${round} of ${ceiling}`
      : null;
  }

  constructor() {
    void this.jira.load();
  }

  /** Runs the action of a menu item, or of the one button shown when the menu would hold only it. */
  protected run(id: MenuItemId): void {
    switch (id) {
      case 'budget':
        return this.openBudget();
      case 'models':
        return this.openModels();
      case 'intake':
        return this.openRefreshIntake();
      case 'design':
        return this.openRefreshDesign();
      case 'followUp':
        return this.openStartFollowUp();
      case 'raiseCeiling':
        return this.openRaiseCeiling();
      case 'stop':
        return this.openStop();
      case 'cancel':
        return this.openCancel();
    }
  }

  /** A menu item was picked: the menu closes, the focus goes back to More (the dialog returns it there) and it runs. */
  protected choose(id: MenuItemId): void {
    this.closeMenu(true);
    this.run(id);
  }

  protected toggleMenu(): void {
    if (this.menuOpen()) this.closeMenu(false);
    else this.showMenu();
  }

  /** ArrowDown on More opens the menu on its first item. */
  protected openMenu(event: Event): void {
    event.preventDefault();
    this.showMenu();
  }

  /** The menu's keys: arrows and Home/End move between items, Escape closes it back to More, Tab closes it. */
  protected menuKey(event: KeyboardEvent): void {
    const items = this.menuButtons();
    const at = items.findIndex((item) => item === document.activeElement);
    const move = (to: number): void => {
      event.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
        return move(at + 1);
      case 'ArrowUp':
        return move(at - 1);
      case 'Home':
        return move(0);
      case 'End':
        return move(items.length - 1);
      case 'Escape':
        event.preventDefault();
        return this.closeMenu(true);
      case 'Tab':
        return this.closeMenu(false);
    }
  }

  /** Closes the menu on a click anywhere outside it. */
  protected closeOutside(event: Event): void {
    if (!this.menuOpen()) return;
    const wrap = this.host.nativeElement.querySelector('.header__more');
    if (
      wrap !== null &&
      event.target instanceof Node &&
      wrap.contains(event.target)
    )
      return;
    this.closeMenu(false);
  }

  /** Scrolls to the open gate's decision (above the tabs) and puts the focus on its first card. */
  protected goToDecision(): void {
    const host = document.getElementById('decide');
    if (host === null) return;
    // The panel's host adds no box of its own (display: contents), so the section inside it is what scrolls into view.
    const panel = host.querySelector('.ah-panel') ?? host;
    panel.scrollIntoView({ block: 'start' });
    host.querySelector<HTMLInputElement>('input[type="radio"]')?.focus({
      preventScroll: true,
    });
  }

  private showMenu(): void {
    this.menuOpen.set(true);
    afterNextRender(() => this.menuButtons()[0]?.focus(), {
      injector: this.injector,
    });
  }

  private closeMenu(refocus: boolean): void {
    this.menuOpen.set(false);
    if (refocus)
      this.host.nativeElement
        .querySelector<HTMLButtonElement>('.header__more > button')
        ?.focus();
  }

  private menuButtons(): HTMLButtonElement[] {
    return [
      ...this.host.nativeElement.querySelectorAll<HTMLButtonElement>(
        '.header__menu [role="menuitem"]:not(:disabled)'
      ),
    ];
  }

  protected openStop(): void {
    this.dialogs.stop(this.context);
  }

  protected openCancel(): void {
    this.dialogs.cancel(this.context);
  }

  protected openRestart(): void {
    this.dialogs.restart(this.context);
  }

  protected openStartFollowUp(): void {
    this.dialogs.startFollowUp(this.context);
  }

  protected openRaiseCeiling(): void {
    this.dialogs.raiseRevisionCeiling(this.context);
  }

  protected openResume(): void {
    this.dialogs.resume(this.context);
  }

  protected openUnblock(): void {
    this.dialogs.unblock(this.context);
  }

  protected openBudget(): void {
    this.dialogs.budget(this.context);
  }

  protected openModels(): void {
    this.dialogs.models(this.context);
  }

  protected openRefreshIntake(): void {
    this.dialogs.refreshIntake(this.context);
  }

  protected openRefreshDesign(): void {
    this.dialogs.refreshDesign(this.context);
  }
}
