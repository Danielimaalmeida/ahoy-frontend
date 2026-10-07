import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { IconName } from "@ui/icon/icons";
import { EmptyState } from "./empty-state";

@Component({
  imports: [EmptyState],
  template: `
    <ah-empty-state [heading]="heading()" [icon]="icon()">
      Nothing needs you right now. Questions, decisions and anchored voyages show up here.
      <a ahEmptyAction class="ah-btn" href="/voyages">See all voyages</a>
    </ah-empty-state>
  `,
})
class Host {
  readonly heading = signal("Calm seas");
  readonly icon = signal<IconName>("anchor");
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, empty: root.querySelector(".ah-empty")! };
}

describe("ah-empty-state", () => {
  it("shows an icon, a title, one sentence and one way forward, in that order", () => {
    const { empty } = render();
    expect(
      Array.from(empty.children).map((c) => c.tagName.toLowerCase() + (c.className ? "." + c.className : "")),
    ).toEqual(["ah-icon", "span.ah-empty__title", "span.ah-muted", "a.ah-btn"]);
    expect(empty.querySelector(".ah-empty__title")!.textContent).toBe("Calm seas");
    expect(empty.querySelector(".ah-muted")!.textContent!.trim()).toBe(
      "Nothing needs you right now. Questions, decisions and anchored voyages show up here.",
    );
    const action = empty.querySelector("a")!;
    expect(action.textContent).toBe("See all voyages");
    expect(action.getAttribute("href")).toBe("/voyages");
  });

  it("keeps the action out of the muted sentence", () => {
    const { empty } = render();
    expect(empty.querySelector(".ah-muted a")).toBeNull();
  });

  it("draws the anchor by default as a decorative icon, and another when asked", () => {
    const { fixture, empty } = render();
    const icon = empty.querySelector("svg")!;
    expect(icon.getAttribute("data-icon")).toBe("anchor");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    fixture.componentInstance.icon.set("compass");
    fixture.detectChanges();
    expect(empty.querySelector("svg")!.getAttribute("data-icon")).toBe("compass");
  });

  it("works without an action", () => {
    TestBed.resetTestingModule();
    @Component({
      imports: [EmptyState],
      template: `<ah-empty-state heading="No anchored voyages">Every voyage is moving.</ah-empty-state>`,
    })
    class Bare {}
    const fixture = TestBed.createComponent(Bare);
    fixture.detectChanges();
    const empty = (fixture.nativeElement as HTMLElement).querySelector(".ah-empty")!;
    expect(empty.querySelector(".ah-empty__title")!.textContent).toBe("No anchored voyages");
    expect(empty.querySelector("a, button")).toBeNull();
  });
});
