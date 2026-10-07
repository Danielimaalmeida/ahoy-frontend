import { Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import type { HumanDecision } from "@core/api/types";
import { Banner } from "@ui/banner/banner";
import { Button } from "@ui/button/button";
import { VoyageContext } from "../../context/voyage-context";
import { PlanDecision } from "./plan-decision";

/** What the user tried, as a noun: "Your send-back wasn't recorded". */
const ATTEMPTED: Readonly<Record<HumanDecision, string>> = {
  approve: "approval",
  send_back: "send-back",
  reject: "rejection",
};

/** How a copy to the clipboard went. */
type CopyState = "idle" | "copied" | "failed";

/**
 * "{actor} already {approved|sent back|rejected} this plan" (wireframe `States`): someone decided the gate first
 * (`409 decision_already_recorded`). The user's decision was not recorded; the panel says who decided and where the voyage
 * is now, keeps what the user had written with a way to copy it, and links to the decision in Gates.
 */
@Component({
  selector: "ah-decision-conflict",
  imports: [Banner, Button, RouterLink],
  styleUrl: "./decision-panel.scss",
  styles: `
    :host {
      display: contents;
    }
  `,
  template: `
    @if (conflict(); as c) {
      <ah-banner variant="error" icon="info" announce="alert" [heading]="heading()">
        <p>
          Your {{ attempted() }} wasn't recorded.
          @if (c.phase !== "") {
            The voyage moved on to <b>{{ c.phase }}</b
            >.
          }
          @if (c.text !== "") {
            Your text is kept below in case you want to raise it with the crew.
          }
        </p>
        @if (c.text !== "") {
          <p class="decision__quote decision__kept">{{ c.text }}</p>
        }
        <span class="decision__actions">
          @if (c.text !== "") {
            <button type="button" ahButton size="sm" (click)="copy(c.text)">Copy my text</button>
          }
          <a ahButton size="sm" [routerLink]="['/voyages', key(), 'gates']">See the decision</a>
          @if (copied() === "copied") {
            <span class="ah-hint" role="status">Copied.</span>
          } @else if (copied() === "failed") {
            <span class="ah-hint" role="status">Couldn't copy: select the text above and copy it.</span>
          }
        </span>
      </ah-banner>
    }
  `,
})
export class DecisionConflictPanel {
  private readonly context = inject(VoyageContext);
  private readonly decision = inject(PlanDecision);

  protected readonly conflict = this.decision.conflict;
  protected readonly copied = signal<CopyState>("idle");
  protected readonly key = computed(() => this.context.key() ?? "");
  protected readonly attempted = computed(() => {
    const c = this.conflict();
    return c === null ? "" : ATTEMPTED[c.attempted];
  });
  protected readonly heading = computed(() => {
    const by = this.conflict()?.by ?? null;
    return by === null ? "Someone already decided this plan" : `${by.actor} already ${by.did} this plan`;
  });

  /** Copies the user's text; the Clipboard API can be missing or refused, and then the text is still on screen. */
  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set("copied");
    } catch {
      this.copied.set("failed");
    }
  }
}
