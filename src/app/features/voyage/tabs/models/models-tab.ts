import {
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { ModelSlot, SlotModel } from '@core/api/types';
import {
  apiErrorView,
  commandErrorView,
  type CommandErrorView,
} from '@core/commands/command-error';
import { CREW } from '@domain/models';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { Panel, PanelBody, PanelFoot, PanelHead } from '@ui/panel/panel';
import { SkeletonRows, type SkeletonColumn } from '@ui/skeleton/skeleton';
import { Source } from '@ui/tags/source';
import { Nowrap, Table } from '@ui/table/table';
import { ToastService } from '@ui/toast/toast';
import { map } from 'rxjs';
import { modelLabel } from '../../context/crew';
import { VoyageContext } from '../../context/voyage-context';
import {
  ChangeModelsDialog,
  type ChangeModelsData,
} from './change-models-dialog';
import {
  chosenLabel,
  parseChangeSlot,
  refusedSlots,
  resetChange,
  sourceLabels,
} from './models-change';
import { ModelsCommand } from './models-command';

/** One row of the table as the template reads it. */
interface ModelRow {
  readonly slot: SlotModel;
  readonly crew: string;
  /** "gpt-5.6-terra · high", or "claude-sonnet-5 · default". */
  readonly next: string;
  readonly modelFrom: string;
  readonly effortFrom: string;
  readonly modelChosen: boolean;
  readonly effortChosen: boolean;
  /** What a person chose for the voyage, or null. */
  readonly chosen: string | null;
  readonly refused: boolean;
}

const SKELETON_COLUMNS: readonly SkeletonColumn[] = [
  { track: '110px' },
  { track: '130px' },
  { track: 'minmax(0, 1fr)' },
  { track: '110px', height: 20 },
  { track: '110px', height: 20 },
  { track: 'minmax(0, 1fr)' },
];

/**
 * The Models tab (wireframe `Halted`, lane 4D): what each phase's next run gets and where it comes from, what was chosen
 * for this voyage, and Change and Reset for the slots that were chosen. A slot marked "refused last run" is the one whose
 * last run of the phase failed on the model it still has. `?change=<slot>` (from the Halted banner and the decision
 * panel) opens the Change models dialog with the focus on that slot.
 */
@Component({
  selector: 'ah-models-tab',
  imports: [
    Banner,
    Button,
    Nowrap,
    Panel,
    PanelBody,
    PanelFoot,
    PanelHead,
    SkeletonRows,
    Source,
    Table,
  ],
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    /* position: the visually hidden "Actions" header is absolute and must not stretch the page. */
    .models__scroll {
      position: relative;
      overflow-x: auto;
    }
    .models__actions {
      display: flex;
      gap: var(--space-1\\.5);
      justify-content: flex-end;
    }
    .models__refused {
      margin-left: var(--space-1\\.5);
    }
    .models__banner {
      margin: var(--space-3) var(--space-4) 0;
    }
  `,
  template: `
    <ah-panel>
      <ah-panel-head
        heading="Models per phase"
        subtitle="What each phase's next run gets, and where it comes from. A change applies from that phase's next run."
      >
        <button
          ahButton
          size="sm"
          ahPanelActions
          type="button"
          [disabled]="!rows().length"
          (click)="change(null)"
        >
          Change models
        </button>
      </ah-panel-head>
      @if (actionError(); as e) {
        <ah-banner
          class="models__banner"
          [variant]="e.variant"
          [heading]="e.heading"
          [tech]="e.tech ?? ''"
          >{{ e.text ?? '' }}</ah-banner
        >
      }
      @if (context.models() === null) {
        <ah-panel-body>
          @if (loadError(); as e) {
            <ah-banner
              [variant]="e.variant"
              [heading]="e.heading"
              [tech]="e.tech ?? ''"
            >
              {{ e.text ?? '' }}
              <button ahButton size="sm" type="button" (click)="retry()">
                Try again
              </button>
            </ah-banner>
          } @else {
            <ah-skeleton-rows [rows]="5" [columns]="skeletonColumns" />
          }
        </ah-panel-body>
      } @else {
        <div class="models__scroll">
          <table ahTable>
            <thead>
              <tr>
                <th scope="col">Phase</th>
                <th scope="col">Agent</th>
                <th scope="col">Next run gets</th>
                <th scope="col">Model from</th>
                <th scope="col">Effort from</th>
                <th scope="col">Chosen for this voyage</th>
                <th scope="col"><span class="ah-sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.slot.slot) {
                <tr [attr.data-slot]="row.slot.slot">
                  <td class="ah-mono">{{ row.slot.phase }}</td>
                  <td>{{ row.crew }}</td>
                  <td>
                    <span class="ah-mono">{{ row.next }}</span>
                    @if (row.refused) {
                      <span class="ah-badge ah-badge--halted models__refused"
                        >refused last run</span
                      >
                    }
                  </td>
                  <td>
                    <ah-source [chosen]="row.modelChosen">{{
                      row.modelFrom
                    }}</ah-source>
                  </td>
                  <td>
                    <ah-source [chosen]="row.effortChosen">{{
                      row.effortFrom
                    }}</ah-source>
                  </td>
                  <td
                    [class.ah-mono]="row.chosen !== null"
                    [class.ah-hint]="row.chosen === null"
                  >
                    {{ row.chosen ?? '—' }}
                  </td>
                  <td ahNowrap>
                    @if (row.slot.chosen !== null) {
                      <span class="models__actions">
                        <button
                          ahButton
                          size="sm"
                          type="button"
                          [attr.aria-label]="'Change ' + row.crew + ' model'"
                          (click)="change(row.slot.slot)"
                        >
                          Change
                        </button>
                        <button
                          ahButton="ghost"
                          size="sm"
                          type="button"
                          [attr.aria-label]="
                            'Reset ' + row.crew + ' to default'
                          "
                          [disabled]="busy()"
                          (click)="reset(row.slot.slot)"
                        >
                          Reset
                        </button>
                      </span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      <ah-panel-foot>
        <span class="ah-hint"
          >Sources, strongest first: this revision only · chosen for this voyage
          · server default · agent config (pinned) · the agent's own profile. A
          model chosen without an effort runs at its own default effort.</span
        >
      </ah-panel-foot>
    </ah-panel>
  `,
})
export class ModelsTab {
  protected readonly context = inject(VoyageContext);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly command = inject(ModelsCommand);

  protected readonly skeletonColumns = SKELETON_COLUMNS;
  protected readonly busy = this.context.commands.pending;
  /** Why the last Reset did not go through; null before and after a success. */
  protected readonly actionError = signal<CommandErrorView | null>(null);

  /** Why the model plan could not be read, while there is none to show. */
  protected readonly loadError = computed((): CommandErrorView | null => {
    const error = this.context.handle()?.models.error() ?? null;
    return error === null ? null : apiErrorView(error);
  });

  private readonly changeParam = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => parseChangeSlot(params.get('change')))
    ),
    {
      initialValue: parseChangeSlot(
        this.route.snapshot.queryParamMap.get('change')
      ),
    }
  );
  /** `?change=` was already acted on: it opens the dialog once, however often the plan is read again. */
  private handledChange = false;

  protected readonly rows = computed((): readonly ModelRow[] => {
    const plan = this.context.models();
    if (plan === null) return [];
    const refused = refusedSlots(
      this.context.story(),
      this.context.runs(),
      plan
    );
    return plan.slots.map((slot) => {
      const sources = sourceLabels(slot);
      return {
        slot,
        crew: CREW[slot.slot],
        next: modelLabel(slot),
        modelFrom: sources.model,
        effortFrom: sources.effort,
        modelChosen: slot.modelSource === 'story',
        effortChosen: slot.effortSource === 'story',
        chosen: chosenLabel(slot),
        refused: refused.has(slot.slot),
      };
    });
  });

  constructor() {
    effect(() => {
      const slot = this.changeParam();
      if (slot === null) {
        this.handledChange = false;
        return;
      }
      if (
        this.handledChange ||
        this.context.models() === null ||
        this.context.story() === null
      )
        return;
      this.handledChange = true;
      untracked(() => {
        this.change(slot);
        // The link has done its job: drop it, so a refresh or Back does not open the dialog again.
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { change: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });
    });
  }

  /** Opens "Models per phase", with the focus on `slot` when there is one. */
  protected change(slot: ModelSlot | null): void {
    this.actionError.set(null);
    this.dialogs.open<unknown, ChangeModelsData, ChangeModelsDialog>(
      ChangeModelsDialog,
      {
        data: { context: this.context, slot },
        width: '640px',
      }
    );
  }

  /** Reads the model plan again after it could not be read. */
  protected retry(): void {
    void this.context.handle()?.models.refresh();
  }

  /** Gives a slot back to the default: `{slot: null}`. */
  protected async reset(slot: ModelSlot): Promise<void> {
    this.actionError.set(null);
    const outcome = await this.command.save(
      this.context,
      resetChange(slot),
      ''
    );
    if (outcome.kind === 'ok') {
      this.toasts.show(
        `${CREW[slot]} is back on the default model. Applies from its next run.`
      );
    } else {
      this.actionError.set(commandErrorView(outcome));
    }
  }
}
