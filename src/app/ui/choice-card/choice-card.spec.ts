import { Component } from "@angular/core";
import type { ComponentFixture } from "@angular/core/testing";
import { TestBed } from "@angular/core/testing";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import type { ChoiceOption } from "./choice-card";
import { ChoiceCardGroup } from "./choice-card";

type Decision = "approve" | "send_back" | "reject";

const OPTIONS: readonly ChoiceOption<Decision>[] = [
  { value: "approve", title: "Approve", description: "The voyage moves on to implementation." },
  { value: "send_back", title: "Send back", description: "Cartographer revises the plan. This would be round 3 of 4." },
  { value: "reject", title: "Reject", description: "The voyage runs aground (blocked)." },
];

@Component({
  imports: [ChoiceCardGroup, ReactiveFormsModule],
  template: `<ah-choice-card-group label="Your decision" [options]="options" [formControl]="decision" />`,
})
class Host {
  options: readonly ChoiceOption<Decision>[] = OPTIONS;
  readonly decision = new FormControl<Decision | null>("send_back");
}

let fixture: ComponentFixture<Host>;

async function render(options?: readonly ChoiceOption<Decision>[]): Promise<HTMLElement> {
  fixture = TestBed.createComponent(Host);
  if (options) fixture.componentInstance.options = options;
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function radios(root: HTMLElement): HTMLInputElement[] {
  return Array.from(root.querySelectorAll<HTMLInputElement>("input[type=radio]"));
}

function key(target: Element, name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("ah-choice-card-group", () => {
  it("renders each option as a labelled radio card with its consequence", async () => {
    const root = await render();
    const group = root.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute("aria-label")).toBe("Your decision");
    const cards = Array.from(root.querySelectorAll("label.ah-choice"));
    expect(cards.map((c) => c.querySelector("b")!.textContent)).toEqual(["Approve", "Send back", "Reject"]);
    expect(cards[2]!.querySelector(".ah-choice__desc")!.textContent).toBe("The voyage runs aground (blocked).");
    const names = new Set(radios(root).map((r) => r.name));
    expect(names.size).toBe(1);
  });

  it("shows the form value as the checked card", async () => {
    const root = await render();
    expect(radios(root).map((r) => r.checked)).toEqual([false, true, false]);
    fixture.componentInstance.decision.setValue("reject");
    await fixture.whenStable();
    expect(radios(root).map((r) => r.checked)).toEqual([false, false, true]);
  });

  it("writes the picked card to the form and marks it touched on blur", async () => {
    const root = await render();
    const approve = radios(root)[0]!;
    approve.click();
    await fixture.whenStable();
    const control = fixture.componentInstance.decision;
    expect(control.value).toBe("approve");
    expect(control.dirty).toBe(true);
    approve.dispatchEvent(new Event("blur"));
    expect(control.touched).toBe(true);
  });

  it("moves the selection with the arrow keys, wrapping around and focusing the card", async () => {
    const root = await render();
    const control = fixture.componentInstance.decision;
    const [, sendBack] = radios(root);
    expect(key(sendBack!, "ArrowDown").defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(control.value).toBe("reject");
    expect(document.activeElement).toBe(radios(root)[2]);
    key(radios(root)[2]!, "ArrowRight");
    expect(control.value).toBe("approve");
    key(radios(root)[0]!, "ArrowUp");
    expect(control.value).toBe("reject");
    key(radios(root)[2]!, "ArrowLeft");
    expect(control.value).toBe("send_back");
    expect(key(radios(root)[1]!, "Enter").defaultPrevented).toBe(false);
    expect(control.value).toBe("send_back");
  });

  it("skips disabled cards and starts from the first one when nothing is picked", async () => {
    const root = await render([OPTIONS[0]!, { ...OPTIONS[1]!, disabled: true }, OPTIONS[2]!]);
    const control = fixture.componentInstance.decision;
    control.setValue(null);
    await fixture.whenStable();
    expect(radios(root)[1]!.disabled).toBe(true);
    key(radios(root)[0]!, "ArrowDown");
    expect(control.value).toBe("approve");
    key(radios(root)[0]!, "ArrowDown");
    expect(control.value).toBe("reject");
  });

  it("follows the form control's disabled state", async () => {
    const root = await render();
    const control = fixture.componentInstance.decision;
    control.disable();
    await fixture.whenStable();
    expect(radios(root).every((r) => r.disabled)).toBe(true);
    key(radios(root)[1]!, "ArrowDown");
    expect(control.value).toBe("send_back");
  });
});
