import { Component, signal } from "@angular/core";
import type { ComponentFixture } from "@angular/core/testing";
import { TestBed } from "@angular/core/testing";
import { FormControl } from "@angular/forms";
import type { ModelSlot } from "@domain/types";
import type { EffortChoice, ModelChoiceControls, ModelChoiceRowSpec } from "./model-choice";
import { ModelChoiceRow, ModelChoiceTable, lookoutsConflictMessage } from "./model-choice";

function controls(model = "", effort: EffortChoice = ""): ModelChoiceControls {
  return {
    model: new FormControl(model, { nonNullable: true }),
    effort: new FormControl<EffortChoice>(effort, { nonNullable: true }),
  };
}

const ROWS: readonly ModelChoiceRowSpec[] = [
  { slot: "intake", defaultModel: "gpt-5.6-terra", defaultEffort: "medium", source: "Server default" },
  { slot: "planning", source: "Chosen for this voyage", chosen: true },
  { slot: "implementation", source: "Agent config", error: "Pick a model the account can use." },
  { slot: "review-design", defaultModel: "gpt-5.6-terra", source: "Server default" },
  { slot: "review-defect", defaultModel: "claude-sonnet-5", source: "Server default" },
];

@Component({
  imports: [ModelChoiceTable],
  template: `<ah-model-choice-table [rows]="rows()" [controls]="form" (restoreDefault)="resets.push($event)" />`,
})
class TableHost {
  readonly rows = signal(ROWS);
  readonly form: Record<ModelSlot, ModelChoiceControls> = {
    intake: controls(),
    planning: controls("claude-sonnet-5", "high"),
    implementation: controls(),
    "review-design": controls(),
    "review-defect": controls(),
  };
  readonly resets: ModelSlot[] = [];
}

let fixture: ComponentFixture<TableHost>;

async function render(): Promise<{ root: HTMLElement; host: TableHost }> {
  fixture = TestBed.createComponent(TableHost);
  await fixture.whenStable();
  return { root: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

function rows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".ah-model"));
}

/** The error line right after a row, if any. */
function errorAfter(row: HTMLElement): HTMLElement | null {
  const next = row.nextElementSibling;
  return next?.classList.contains("ah-field__error") ? (next as HTMLElement) : null;
}

describe("ah-model-choice-table", () => {
  it("renders one row per slot with phase, crew, labelled model and effort, and the source tag", async () => {
    const { root } = await render();
    const all = rows(root);
    expect(all.map((r) => r.querySelector(".ah-model__phase")!.textContent)).toEqual([
      "intakeNavigator",
      "planningCartographer",
      "implementationImplementer",
      "pr_reviewLookout · design",
      "pr_reviewLookout · defects",
    ]);
    const intake = all[0]!;
    const model = intake.querySelector("input")!;
    expect(model.className).toContain("ah-input--mono");
    expect(model.getAttribute("aria-label")).toBe("Intake model");
    expect(model.placeholder).toBe("Default: gpt-5.6-terra");
    const select = intake.querySelector("select")!;
    expect(select.getAttribute("aria-label")).toBe("Intake effort");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Default (medium)",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(intake.querySelector(".ah-source")!.textContent).toBe("Server default");
    expect(intake.querySelector("button")).toBeNull();
    expect(all[1]!.querySelector("select")!.options[0]!.textContent).toBe("Default");
    expect(all[1]!.querySelector("input")!.placeholder).toBe("Default");
    expect(all[3]!.querySelector("input")!.getAttribute("aria-label")).toBe("Design reviewer model");
  });

  it("shows the form's values and marks a chosen slot", async () => {
    const { root } = await render();
    const planning = rows(root)[1]!;
    expect(planning.querySelector("input")!.value).toBe("claude-sonnet-5");
    expect(planning.querySelector("select")!.value).toBe("high");
    expect(planning.querySelector(".ah-source")!.className).toBe("ah-source ah-source--chosen");
    const reset = planning.querySelector("button")!;
    expect(reset.getAttribute("aria-label")).toBe("Reset planning to default");
    expect(reset.querySelector("svg")!.getAttribute("data-icon")).toBe("reset");
  });

  it("reset clears the slot's controls and reports the slot, so the page sends null for it", async () => {
    const { root, host } = await render();
    rows(root)[1]!.querySelector("button")!.click();
    await fixture.whenStable();
    expect(host.form.planning.model.value).toBe("");
    expect(host.form.planning.effort.value).toBe("");
    expect(host.form.planning.model.dirty).toBe(true);
    expect(host.resets).toEqual(["planning"]);
  });

  it("shows a row's own error under it, linked from its model input", async () => {
    const { root } = await render();
    const implementation = rows(root)[2]!;
    const error = errorAfter(implementation)!;
    expect(error.textContent).toBe("Pick a model the account can use.");
    const input = implementation.querySelector("input")!;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(errorAfter(rows(root)[0]!)).toBeNull();
    expect(rows(root)[0]!.querySelector("input")!.getAttribute("aria-invalid")).toBeNull();
  });

  it("shows the Lookouts error under both reviewer rows when they would run on the same model", async () => {
    const { root, host } = await render();
    expect(errorAfter(rows(root)[3]!)).toBeNull();
    // Typed design reviewer = the defect reviewer's default.
    host.form["review-design"].model.setValue("claude-sonnet-5");
    await fixture.whenStable();
    const message = lookoutsConflictMessage("claude-sonnet-5");
    expect(message).toBe("The two Lookouts must use different models: both would run on claude-sonnet-5.");
    for (const row of [rows(root)[3]!, rows(root)[4]!]) {
      const error = errorAfter(row)!;
      expect(error.textContent).toBe(message);
      expect(row.querySelector("input")!.getAttribute("aria-invalid")).toBe("true");
      expect(row.querySelector("input")!.getAttribute("aria-describedby")).toBe(error.id);
    }
    const ids = [errorAfter(rows(root)[3]!)!.id, errorAfter(rows(root)[4]!)!.id];
    expect(new Set(ids).size).toBe(2);
    expect(root.querySelectorAll(".ah-field__error")).toHaveLength(3);
  });

  it("follows typing: the error appears when both are typed alike and goes when one changes", async () => {
    const { root } = await render();
    const design = rows(root)[3]!.querySelector("input")!;
    const defects = rows(root)[4]!.querySelector("input")!;
    design.value = "o5";
    design.dispatchEvent(new Event("input"));
    defects.value = " o5 ";
    defects.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    expect(errorAfter(rows(root)[4]!)!.textContent).toBe(lookoutsConflictMessage("o5"));
    defects.value = "o6";
    defects.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    expect(errorAfter(rows(root)[3]!)).toBeNull();
    expect(errorAfter(rows(root)[4]!)).toBeNull();
  });

  it("doesn't flag two blank reviewers whose defaults are unknown", async () => {
    const { root, host } = await render();
    host.rows.set(ROWS.map((r) => ({ slot: r.slot })));
    await fixture.whenStable();
    expect(root.querySelectorAll(".ah-field__error")).toHaveLength(0);
  });
});

@Component({
  imports: [ModelChoiceTable],
  template: `<ah-model-choice-table [rows]="rows" [controls]="form" />`,
})
class PartialHost {
  readonly rows = ROWS;
  readonly form: Partial<Record<ModelSlot, ModelChoiceControls>> = {
    planning: controls(),
    "review-defect": controls(),
  };
}

describe("ah-model-choice-table with some slots", () => {
  it("leaves out a spec that has no controls", async () => {
    const f = TestBed.createComponent(PartialHost);
    await f.whenStable();
    const phases = Array.from((f.nativeElement as HTMLElement).querySelectorAll(".ah-model__crew"));
    expect(phases.map((p) => p.textContent)).toEqual(["Cartographer", "Lookout · defects"]);
  });
});

@Component({
  imports: [ModelChoiceRow],
  template: `<ah-model-choice-row
    slot="intake"
    [controls]="c"
    [resettable]="true"
    (restoreDefault)="got.push($event)"
  />`,
})
class RowHost {
  readonly c = controls("gpt-5.6-terra", "low");
  readonly got: null[] = [];
}

describe("ah-model-choice-row", () => {
  it("emits null on reset, and can offer reset for a value that isn't chosen", async () => {
    const f = TestBed.createComponent(RowHost);
    await f.whenStable();
    const button = (f.nativeElement as HTMLElement).querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("Reset intake to default");
    button.click();
    expect(f.componentInstance.got).toEqual([null]);
    expect(f.componentInstance.c.model.value).toBe("");
  });
});
