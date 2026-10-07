import { Component, signal } from "@angular/core";
import type { SectionTab } from "@ui/section-tabs/section-tabs";
import { SectionTabs } from "@ui/section-tabs/section-tabs";

/** Gallery: the SectionTabs preview. The route tabs are real links (none is current here); the pills are buttons. */
@Component({
  selector: "ah-kit-section-tabs",
  imports: [SectionTabs],
  template: `
    <ah-section-tabs label="Voyage sections" [items]="voyage" />
    <ah-section-tabs variant="pill" label="Ahoy state" [items]="states" [(selected)]="state" />
    <ah-section-tabs variant="pill" label="Artifact mode" [items]="modes" [(selected)]="mode" />
  `,
})
export class KitSectionTabs {
  protected readonly voyage: readonly SectionTab[] = [
    { id: "plan", label: "Plan", link: "/voyages/PROJ-123/plan" },
    { id: "questions", label: "Questions", link: "/voyages/PROJ-123/questions", count: 2 },
    { id: "runs", label: "Runs", link: "/voyages/PROJ-123/runs", count: 4 },
    { id: "gates", label: "Gates", link: "/voyages/PROJ-123/gates", count: 5 },
    { id: "artifacts", label: "Artifacts", link: "/voyages/PROJ-123/artifacts" },
    { id: "log", label: "Ship's log", link: "/voyages/PROJ-123/log" },
    { id: "models", label: "Models", link: "/voyages/PROJ-123/models" },
  ];
  protected readonly states: readonly SectionTab[] = [
    { id: "all", label: "All" },
    { id: "not-started", label: "Not started" },
    { id: "in-ahoy", label: "In Ahoy" },
  ];
  protected readonly modes: readonly SectionTab[] = [
    { id: "view", label: "View" },
    { id: "compare", label: "Compare" },
  ];
  protected readonly state = signal<string | null>("all");
  protected readonly mode = signal<string | null>("view");
}
