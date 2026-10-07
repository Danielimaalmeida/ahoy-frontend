import type { Type } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { KitDialog } from "./1c-dialog";
import { KitMarkdown } from "./1c-markdown";
import { KitModelChoice } from "./1c-model-choice";
import { KIT_SECTIONS_1C } from "./1c-sections";

async function render<T>(component: Type<T>): Promise<HTMLElement> {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(component);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe("lane 1C gallery sections", () => {
  it("lists the eight 1C components", () => {
    expect(KIT_SECTIONS_1C.map((s) => s.title)).toEqual([
      "Dialog",
      "ChoiceCard",
      "QuestionCard",
      "ModelChoice",
      "LiveSteps",
      "ShipsLog",
      "ArtifactDiff",
      "Markdown",
    ]);
  });

  it.each(KIT_SECTIONS_1C.map((s) => [s.title, s.component] as const))("renders %s", async (_, component) => {
    const root = await render(component);
    expect(root.children.length).toBeGreaterThan(0);
  });

  it("shows the three dialog kinds and the preview's cost box", async () => {
    const root = await render(KitDialog);
    const tiles = Array.from(root.querySelectorAll(".ah-dialog__icon")).map((t) => t.className.trim());
    expect(tiles).toEqual([
      "ah-dialog__icon",
      "ah-dialog__icon ah-dialog__icon--sendback",
      "ah-dialog__icon ah-dialog__icon--danger",
    ]);
    expect(root.querySelector(".ah-cost b")!.textContent).toBe("This may spend up to 10.2 AIU");
  });

  it("shows the Lookouts error under both reviewer rows and disables Save", async () => {
    const root = await render(KitModelChoice);
    expect(root.querySelectorAll(".ah-field__error")).toHaveLength(2);
    expect(root.querySelector<HTMLButtonElement>(".kit-row button")!.disabled).toBe(true);
  });

  it("marks the changed plan blocks and keeps the hostile sample inert", async () => {
    const root = await render(KitMarkdown);
    const [plan, hostile] = Array.from(root.querySelectorAll("ah-markdown"));
    expect(plan!.querySelectorAll(".ah-mark").length).toBeGreaterThan(0);
    expect(hostile!.querySelector("script, img, [onclick]")).toBeNull();
    expect(Array.from(hostile!.querySelectorAll("a"))).toHaveLength(0);
  });
});
