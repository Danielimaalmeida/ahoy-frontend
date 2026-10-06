import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Panel, PanelBody, PanelFoot, PanelHead } from "./panel";

@Component({
  imports: [Panel, PanelHead, PanelBody, PanelFoot],
  template: `
    <ah-panel id="full">
      <ah-panel-head heading="Before you sail" subtitle="PROJ-145">
        <span class="badge">Draft</span>
        <button type="button" ahPanelActions>Edit</button>
      </ah-panel-head>
      <ah-panel-body>Runs bill your Copilot account.</ah-panel-body>
      <ah-panel-foot><span>Owner: alex&#64;example.com</span></ah-panel-foot>
    </ah-panel>
    <ah-panel id="bare"><table></table></ah-panel>
    <ah-panel id="sub">
      <ah-panel-head heading="Runs" [level]="3" />
    </ah-panel>
  `,
})
class Host {}

function render(): HTMLElement {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe("ah-panel", () => {
  it("renders the README markup: a section with head, body and foot", () => {
    const section = render().querySelector("#full > section.ah-panel")!;
    const parts = Array.from(section.children).map((c) => c.firstElementChild?.className);
    expect(parts).toEqual(["ah-panel__head", "ah-panel__body", "ah-panel__foot"]);
    expect(section.querySelector(".ah-panel__body")!.textContent).toBe("Runs bill your Copilot account.");
  });

  it("labels the section with its heading", () => {
    const section = render().querySelector("#full > section")!;
    const title = section.querySelector("h2.ah-panel__title")!;
    expect(title.textContent).toBe("Before you sail");
    expect(title.id).not.toBe("");
    expect(section.getAttribute("aria-labelledby")).toBe(title.id);
  });

  it("puts the subtitle after the title and the actions last", () => {
    const head = render().querySelector("#full .ah-panel__head")!;
    expect(Array.from(head.children).map((c) => c.className || c.tagName)).toEqual([
      "ah-panel__title",
      "ah-muted",
      "badge",
      "ah-panel__actions",
    ]);
    expect(head.querySelector(".ah-panel__actions > button")!.textContent).toBe("Edit");
  });

  it("has no label and no head when it has no heading", () => {
    const section = render().querySelector("#bare > section.ah-panel")!;
    expect(section.hasAttribute("aria-labelledby")).toBe(false);
    expect(section.querySelector(".ah-panel__head")).toBeNull();
    expect(section.firstElementChild?.tagName).toBe("TABLE");
  });

  it("gives every panel its own title id and allows an h3", () => {
    const root = render();
    const h3 = root.querySelector("#sub h3.ah-panel__title")!;
    expect(h3.textContent).toBe("Runs");
    expect(h3.id).not.toBe(root.querySelector("#full h2")!.id);
    expect(root.querySelector("#sub section")!.getAttribute("aria-labelledby")).toBe(h3.id);
  });
});
