import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ModelSlot, RefinementStatus } from '@core/api/types';
import { DIAGNOSIS_ACTOR_LABELS, shownFindings } from '@domain/diagnosis';
import { explainHalt } from '@domain/halt';
import { isActiveRefinement } from '@domain/refinement';
import { isModelSlot } from '@domain/models';
import { actorLabel } from '@domain/identifiers';
import { Button } from '@ui/button/button';
import { Icon } from '@ui/icon/icon';
import { Markdown } from '@ui/markdown/markdown';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { runById, slotsForPhase } from '../context/crew';
import { VoyageContext } from '../context/voyage-context';
import type { HaltRecord } from '../context/voyage-events';
import { VoyageDialogs } from '../dialogs/voyage-dialogs';
import { AgentDiagnoses, AGENT_DIAGNOSIS_POLL_MS } from './agent-diagnoses';
import { HaltDiagnosis } from './halt-diagnosis';
import { haltGuidance } from './halt-guidance';

/** The words for an agent diagnosis as it stands ("Waiting for a run slot", "Cancelling", "Failed"). */
export function diagnosisStateLabel(diagnosis: {
  readonly status: RefinementStatus;
  readonly cancelRequested: boolean;
}): string {
  if (isActiveRefinement(diagnosis.status)) {
    if (diagnosis.cancelRequested) return 'Stopping the agent';
    return diagnosis.status === 'queued'
      ? 'Waiting for a run slot'
      : 'The agent is diagnosing it';
  }
  if (diagnosis.status === 'succeeded') return 'Diagnosed';
  return diagnosis.status === 'cancelled' ? 'Cancelled' : 'Failed';
}

/** A sentence without its closing full stop, to follow "Anchored: ". */
function withoutStop(text: string): string {
  return text.endsWith('.') ? text.slice(0, -1) : text;
}

/** What the vocabulary's text says beyond the sentence already in the title ("" when it is only that sentence). */
export function afterTitle(text: string, short: string): string {
  return text.startsWith(short) ? text.slice(short.length).trim() : text;
}

/** The slot whose model a refused run would change: the one slot of its phase, if there is exactly one. */
export function slotToChange(
  slots: readonly { readonly slot: ModelSlot }[],
  phase: string
): ModelSlot | null {
  if (slots.length === 1) return slots[0]?.slot ?? null;
  return slots.length === 0 && isModelSlot(phase) ? phase : null;
}

/**
 * The Anchored banner (wireframe `Halted`), under the header of a halted voyage: what happened in plain words
 * (`explainHalt` and the event's detail), what to do to get under way again (per reason), the technical line, the tail
 * of the worker log as plain text, and for a failed run the way to change its model or resume as is. The detail comes
 * from the last `story.halted` event (G7); until the history is read the banner shows the reason alone. Once the
 * diagnosis is read (`HaltDiagnosis`), it adds each cause with its action, who takes it and the evidence as plain text.
 */
@Component({
  selector: 'ah-anchored-banner',
  imports: [Button, Icon, Markdown, RelativePipe, RouterLink],
  providers: [HaltDiagnosis, AgentDiagnoses],
  styleUrl: './anchored-banner.scss',
  template: `
    @if (view(); as v) {
      <section class="anchored" role="status" aria-labelledby="anchored-title">
        <span class="anchored__icon"
          ><ah-icon name="anchor" [size]="18"
        /></span>
        <div class="anchored__body">
          <h2 id="anchored-title" class="anchored__title">
            Halted: {{ v.title }}
          </h2>
          @if (v.stoppedBy !== null) {
            <p>
              Stopped by {{ v.stoppedBy }}.
              @if (v.detail !== null) {
                Their reason: “{{ v.detail }}”
              }
            </p>
          } @else if (v.text !== '' || v.detail !== null) {
            <p>
              {{ v.text }}
              @if (v.detail !== null) {
                {{ v.detail }}
              }
            </p>
          }
          <p><b>To continue:</b> {{ v.guidance }}</p>
          @if (findings().length > 0) {
            <div class="anchored__diagnosis">
              <h3 class="anchored__subtitle">Diagnosis</h3>
              @for (finding of findings(); track $index) {
                <div class="anchored__finding">
                  <p>
                    <b>{{ finding.title }}</b>
                  </p>
                  <p>
                    {{ finding.action }}
                    <span class="ah-muted">· {{ finding.who }}</span>
                  </p>
                  @if (finding.evidence !== '') {
                    <details class="anchored__log">
                      <summary>Evidence</summary>
                      <pre>{{ finding.evidence }}</pre>
                    </details>
                  }
                </div>
              }
            </div>
          }
          <div class="anchored__agent" aria-label="Agent diagnosis">
            <h3 class="anchored__subtitle">Agent diagnosis</h3>
            @if (agent(); as a) {
              <p>
                <b>{{ a.state }}</b>
                <span class="ah-muted">
                  · asked by {{ a.requestedBy }} ·
                  {{ a.createdAt | ahRelative }}</span
                >
              </p>
              @if (a.active) {
                <p class="ah-muted" role="status">
                  Checked again every {{ pollSeconds }} s.
                </p>
              } @else if (a.exitReason !== '') {
                <p>{{ a.exitReason }}</p>
              }
              @if (a.content !== '') {
                <ah-markdown [source]="a.content" />
              }
            } @else if (diagnoses.state() === 'error') {
              <p class="ah-muted">
                Could not read the agent diagnoses; you can still ask for one.
              </p>
            } @else {
              <p class="ah-muted">
                The rules above are fixed. An agent can read the same history
                and tell what they cannot. It may spend AIU, not the voyage's.
              </p>
            }
            <div class="anchored__row">
              @if (diagnoses.active()) {
                @if (!agent()?.cancelRequested) {
                  <button
                    type="button"
                    ahButton
                    size="sm"
                    (click)="cancelDiagnosis()"
                  >
                    Cancel diagnosis
                  </button>
                }
              } @else {
                <button
                  type="button"
                  ahButton="soft"
                  size="sm"
                  (click)="diagnose(v.key)"
                >
                  {{
                    agent() === null
                      ? 'Ask an agent to diagnose'
                      : 'Diagnose again'
                  }}
                </button>
              }
            </div>
          </div>
          <div class="ah-tech">
            {{ v.tech }}
            @if (v.halt; as halt) {
              · {{ halt.at | ahRelative }}
              @if (halt.detail !== null) {
                · “{{ halt.detail }}”
              }
            }
          </div>
          @if (v.halt?.workerLog; as log) {
            <details class="anchored__log">
              <summary>Worker log (last lines)</summary>
              <pre>{{ log }}</pre>
            </details>
          }
        </div>
        @if (v.failedRun) {
          <div class="anchored__actions">
            @if (v.slot !== null) {
              <a
                ahButton="primary"
                [routerLink]="['/voyages', v.key, 'models']"
                [queryParams]="{ change: v.slot }"
                >Change {{ v.phase }} model</a
              >
            } @else {
              <a ahButton="primary" [routerLink]="['/voyages', v.key, 'models']"
                >Change models</a
              >
            }
            <button type="button" ahButton (click)="resume()">
              Resume as is
            </button>
          </div>
        }
      </section>
    }
  `,
})
export class AnchoredBanner {
  private readonly context = inject(VoyageContext);
  private readonly dialogs = inject(VoyageDialogs);
  private readonly diagnosis = inject(HaltDiagnosis);
  protected readonly diagnoses = inject(AgentDiagnoses);
  protected readonly pollSeconds = AGENT_DIAGNOSIS_POLL_MS / 1000;

  /** The newest agent diagnosis as the banner shows it; null when there is none. */
  protected readonly agent = computed(() => {
    const newest = this.diagnoses.newest();
    if (newest === null) return null;
    const active = isActiveRefinement(newest.status);
    return {
      active,
      cancelRequested: newest.cancelRequested,
      state: diagnosisStateLabel(newest),
      requestedBy: actorLabel(newest.requestedBy),
      createdAt: newest.createdAt,
      exitReason: newest.exitReason ?? '',
      content: newest.content ?? '',
    };
  });

  /** The causes the diagnosis names, beyond a person's stop, which the banner already says. */
  protected readonly findings = computed(() =>
    shownFindings(this.diagnosis.diagnosis()?.findings ?? []).map(
      (finding) => ({
        title: finding.title,
        action: finding.action,
        who: DIAGNOSIS_ACTOR_LABELS[finding.actor],
        evidence: finding.evidence.join('\n'),
      })
    )
  );

  protected readonly view = computed(() => {
    const story = this.context.story();
    if (story?.status !== 'halted') return null;
    const last = this.context.lastHalt();
    const reason = story.haltReason ?? last?.reason ?? 'unknown';
    // Only the event of this halt describes it: an older one may be from an earlier halt for another reason.
    const halt: HaltRecord | null =
      last !== null && last.reason === reason ? last : null;
    const runId = halt?.runId ?? null;
    const run = runById(this.context.runs(), runId);
    const phase = halt?.phase ?? run?.phase ?? story.phase;
    const explanation = explainHalt(reason, halt?.detail ?? undefined);
    const tech = [reason, ...(runId !== null ? [runId] : []), phase].join(
      ' · '
    );
    return {
      key: story.key,
      title: withoutStop(explanation.short),
      text: afterTitle(explanation.text, explanation.short),
      detail: explanation.detail,
      stoppedBy:
        reason === 'stopped_by_user'
          ? actorLabel(halt?.actor ?? 'someone on the crew')
          : null,
      guidance: haltGuidance(reason, {
        phase,
        remainingNanoAiu: this.context.remainingNanoAiu(),
      }),
      tech,
      halt,
      phase,
      failedRun: reason === 'run_failed',
      slot: slotToChange(slotsForPhase(this.context.models(), phase), phase),
    };
  });

  protected resume(): void {
    this.dialogs.resume(this.context);
  }

  protected diagnose(key: string): void {
    this.dialogs.diagnose({ key, diagnoses: this.diagnoses });
  }

  protected cancelDiagnosis(): void {
    const key = this.context.story()?.key ?? '';
    const queued = this.diagnoses.newest()?.status === 'queued';
    this.dialogs.cancelDiagnosis({ key, diagnoses: this.diagnoses, queued });
  }
}
