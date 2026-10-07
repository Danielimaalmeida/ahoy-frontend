import { Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { ModelSlot } from "@core/api/types";
import { explainHalt } from "@domain/halt";
import { isModelSlot } from "@domain/models";
import { actorLabel } from "@domain/identifiers";
import { Button } from "@ui/button/button";
import { Icon } from "@ui/icon/icon";
import { RelativePipe } from "@ui/pipes/relative.pipe";
import { runById, slotsForPhase } from "../context/crew";
import { VoyageContext } from "../context/voyage-context";
import type { HaltRecord } from "../context/voyage-events";
import { VoyageDialogs } from "../dialogs/voyage-dialogs";
import { haltGuidance } from "./halt-guidance";

/** A sentence without its closing full stop, to follow "Anchored: ". */
function withoutStop(text: string): string {
  return text.endsWith(".") ? text.slice(0, -1) : text;
}

/** What the vocabulary's text says beyond the sentence already in the title ("" when it is only that sentence). */
export function afterTitle(text: string, short: string): string {
  return text.startsWith(short) ? text.slice(short.length).trim() : text;
}

/** The slot whose model a refused run would change: the one slot of its phase, if there is exactly one. */
export function slotToChange(slots: readonly { readonly slot: ModelSlot }[], phase: string): ModelSlot | null {
  if (slots.length === 1) return slots[0]?.slot ?? null;
  return slots.length === 0 && isModelSlot(phase) ? phase : null;
}

/**
 * The Anchored banner (wireframe `Halted`), under the header of a halted voyage: what happened in plain words
 * (`explainHalt` and the event's detail), what to do to get under way again (per reason), the technical line, the tail
 * of the worker log as plain text, and for a failed run the way to change its model or resume as is. The detail comes
 * from the last `story.halted` event (G7); until the history is read the banner shows the reason alone.
 */
@Component({
  selector: "ah-anchored-banner",
  imports: [Button, Icon, RelativePipe, RouterLink],
  styleUrl: "./anchored-banner.scss",
  template: `
    @if (view(); as v) {
      <section class="anchored" role="status" aria-labelledby="anchored-title">
        <span class="anchored__icon"><ah-icon name="anchor" [size]="18" /></span>
        <div class="anchored__body">
          <h2 id="anchored-title" class="anchored__title">Anchored: {{ v.title }}</h2>
          @if (v.stoppedBy !== null) {
            <p>
              Stopped by {{ v.stoppedBy }}.
              @if (v.detail !== null) {
                Their reason: “{{ v.detail }}”
              }
            </p>
          } @else if (v.text !== "" || v.detail !== null) {
            <p>
              {{ v.text }}
              @if (v.detail !== null) {
                {{ v.detail }}
              }
            </p>
          }
          <p><b>To get under way again:</b> {{ v.guidance }}</p>
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
              <a ahButton="primary" [routerLink]="['/voyages', v.key, 'models']" [queryParams]="{ change: v.slot }"
                >Change {{ v.phase }} model</a
              >
            } @else {
              <a ahButton="primary" [routerLink]="['/voyages', v.key, 'models']">Change models</a>
            }
            <button type="button" ahButton (click)="resume()">Resume as is</button>
          </div>
        }
      </section>
    }
  `,
})
export class AnchoredBanner {
  private readonly context = inject(VoyageContext);
  private readonly dialogs = inject(VoyageDialogs);

  protected readonly view = computed(() => {
    const story = this.context.story();
    if (story?.status !== "halted") return null;
    const last = this.context.lastHalt();
    const reason = story.haltReason ?? last?.reason ?? "unknown";
    // Only the event of this halt describes it: an older one may be from an earlier halt for another reason.
    const halt: HaltRecord | null = last !== null && last.reason === reason ? last : null;
    const runId = halt?.runId ?? null;
    const run = runById(this.context.runs(), runId);
    const phase = halt?.phase ?? run?.phase ?? story.phase;
    const explanation = explainHalt(reason, halt?.detail ?? undefined);
    const tech = [reason, ...(runId !== null ? [runId] : []), phase].join(" · ");
    return {
      key: story.key,
      title: withoutStop(explanation.short),
      text: afterTitle(explanation.text, explanation.short),
      detail: explanation.detail,
      stoppedBy: reason === "stopped_by_user" ? actorLabel(halt?.actor ?? "someone on the crew") : null,
      guidance: haltGuidance(reason, { phase, remainingNanoAiu: this.context.remainingNanoAiu() }),
      tech,
      halt,
      phase,
      failedRun: reason === "run_failed",
      slot: slotToChange(slotsForPhase(this.context.models(), phase), phase),
    };
  });

  protected resume(): void {
    this.dialogs.resume(this.context);
  }
}
