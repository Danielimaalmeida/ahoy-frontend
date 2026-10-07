import { Component, computed, inject, signal } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { EFFORT_SOURCE_LABELS, MODEL_SOURCE_LABELS } from "@domain/models";
import { Banner } from "@ui/banner/banner";
import { Button } from "@ui/button/button";
import { ChoiceCardGroup } from "@ui/choice-card/choice-card";
import { Field, FieldControl } from "@ui/field/field";
import { Panel, PanelBody, PanelHead } from "@ui/panel/panel";
import { RelativePipe } from "@ui/pipes/relative.pipe";
import { VoyageContext } from "../../context/voyage-context";
import { choiceOptions, confirmLabel, decidedRecord, outcomeWord, PLAN_GATE } from "./decision-view";
import { DECISION_REASON_MESSAGES, PlanDecision } from "./plan-decision";
import { PlanDialogs } from "./plan-dialogs";

/**
 * "Your decision" (wireframe `PlanReview`): Approve, Send back and Reject with what each does, the reason, the model the
 * revision runs on and what it may spend. Approve is sent from here; Send back and Reject open their dialog, once the
 * reason is written. When no decision is open the panel gives way to "No decision needed now" or to the result. A gate
 * other than the plan's gets the same three choices and a note that its summary is not here yet.
 */
@Component({
  selector: "ah-decision-panel",
  imports: [
    Banner,
    Button,
    ChoiceCardGroup,
    Field,
    FieldControl,
    Panel,
    PanelBody,
    PanelHead,
    ReactiveFormsModule,
    RelativePipe,
    RouterLink,
  ],
  styleUrl: "./decision-panel.scss",
  template: `
    @if (gate(); as gateKey) {
      <ah-panel id="decide">
        <ah-panel-head heading="Your decision"
          ><span class="ah-api" aria-label="Gate">{{ gateKey }}</span></ah-panel-head
        >
        <ah-panel-body>
          @if (!decision.isPlan()) {
            <p class="ah-hint">The summary of this gate arrives in a later phase. You can still decide it here.</p>
          }
          @if (panelError(); as e) {
            <ah-banner [variant]="e.variant" [heading]="e.heading" [tech]="e.tech ?? ''" announce="alert">{{
              e.text ?? ""
            }}</ah-banner>
          }
          <ah-choice-card-group label="Your decision" [options]="options()" [formControl]="decision.choice" />
          @if (needsReason()) {
            <ah-field
              [label]="'Reason for ' + decision.crew()"
              required
              [hint]="'Required for send back and reject. Recorded as ' + decision.actor() + '.'"
              [errorMessages]="messages"
              [errorText]="decision.reasonError()"
            >
              <textarea ahInput rows="4" [formControl]="decision.reason"></textarea>
            </ah-field>
          }
          @if (choice() === "send_back") {
            <div class="decision__quote">
              <span class="ah-hint">The revision runs on</span>
              <span>
                @if (model(); as m) {
                  <b class="ah-mono">{{ m }}</b
                  >&ngsp;<span class="ah-hint">for planning · {{ origin() }}</span
                  >&ngsp;
                } @else {
                  <span class="ah-hint">the models of this voyage, still being read</span>&ngsp;
                }
                <a [routerLink]="['/voyages', key(), 'models']" [queryParams]="{ change: 'planning' }">Change</a>
              </span>
              <span class="ah-hint">Spends from the remaining {{ remaining() }} AIU, billed to {{ owner() }}.</span>
            </div>
          }
          <button
            type="button"
            [ahButton]="choice() === 'reject' ? 'danger' : 'primary'"
            class="decision__submit"
            [disabled]="choice() === null"
            [attr.aria-disabled]="decision.busy() ? 'true' : null"
            (click)="decide()"
          >
            {{ label() }}
          </button>
        </ah-panel-body>
      </ah-panel>
    } @else {
      <ah-panel>
        <ah-panel-head heading="Your decision" />
        <ah-panel-body>
          @if (settled(); as s) {
            <p class="decision__result">
              <b>{{ s.word }}</b> by {{ s.actor }} · <span [title]="s.at">{{ s.at | ahRelative }}</span>
            </p>
            @if (s.reason !== null) {
              <p class="decision__quote">“{{ s.reason }}”</p>
            }
          } @else {
            <p class="ah-muted">No decision needed now.</p>
          }
        </ah-panel-body>
      </ah-panel>
    }
  `,
})
export class DecisionPanel {
  private readonly context = inject(VoyageContext);
  private readonly dialogs = inject(PlanDialogs);

  protected readonly decision = inject(PlanDecision);
  protected readonly messages = DECISION_REASON_MESSAGES;
  protected readonly gate = this.context.gateKey;
  protected readonly choice = signal(this.decision.choice.value);
  protected readonly key = computed(() => this.context.key() ?? "");
  protected readonly owner = this.decision.owner;
  protected readonly remaining = this.decision.remaining;
  protected readonly needsReason = computed(() => this.choice() === "send_back" || this.choice() === "reject");
  protected readonly panelError = computed(() => (this.decision.surface() === "panel" ? this.decision.error() : null));

  protected readonly options = computed(() =>
    choiceOptions(this.decision.crew(), this.context.revisionRound(), this.context.revisionCeiling()),
  );

  protected readonly label = computed(() => {
    const choice = this.choice();
    return choice === null ? "Choose a decision" : confirmLabel(choice, this.decision.crew());
  });

  protected readonly model = this.decision.model;

  /** Where the planning model and effort come from: "Chosen for this voyage", or both sources when they differ. */
  protected readonly origin = computed(() => {
    const slot = this.decision.planningSlot();
    if (slot === null) return "";
    const model = MODEL_SOURCE_LABELS[slot.modelSource];
    const effort = EFFORT_SOURCE_LABELS[slot.effortSource];
    return model === effort ? model : `${model} · effort: ${effort}`;
  });

  /** What was decided at the plan gate, for when no decision is open. */
  protected readonly settled = computed(() => {
    const record = decidedRecord(this.decision.records(), PLAN_GATE);
    const word = record === null ? null : outcomeWord(record.outcome);
    if (record === null || word === null) return null;
    const label = word.charAt(0).toUpperCase() + word.slice(1);
    return { word: label, actor: record.actor, at: record.createdAt, reason: record.message };
  });

  constructor() {
    this.decision.choice.valueChanges.subscribe((choice) => this.choice.set(choice));
  }

  /** Approve goes out from here; Send back and Reject open their dialog, once the reason is written. */
  protected async decide(): Promise<void> {
    const choice = this.decision.choice.value;
    if (choice === null || this.decision.busy()) return;
    if (choice === "approve") {
      await this.decision.submit("approve", "panel");
      return;
    }
    if (!this.decision.reasonOk(choice)) return;
    this.decision.clearOutcome();
    if (choice === "send_back") this.dialogs.sendBack(this.context, this.decision);
    else this.dialogs.reject(this.context, this.decision);
  }
}
