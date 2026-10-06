import { TestBed } from "@angular/core/testing";
import type { IconSize } from "./icon";
import { Icon } from "./icon";
import type { IconName } from "./icons";
import { ICON_NAMES, ICONS, isIconName } from "./icons";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The table of `assets/Icons/README.md`. `satisfies` fails to compile if a name is missing or extra. */
const README_TABLE = {
  wheel: "The brand; models per phase",
  bell: "All hands (Needs you)",
  compass: "Voyages; an agent's recommendation",
  anchor: "Anchored (halted); The Docks",
  sail: "Set sail; resume",
  aground: "Aground (blocked); reject",
  "send-back": "Send back",
  lock: "A final answer",
  check: "Done; success toast",
  close: "Close a dialog (needs `aria-label`)",
  reset: "Reset to default (needs `aria-label`)",
  tool: "A tool call in live steps",
  message: "A message in live steps",
  info: "Notes and planned screens",
  refresh: "Changed since you opened it",
  offline: "Lost contact with the API",
} satisfies Record<IconName, string>;

/** Renders one icon and returns its `<svg>`. */
function render(name: IconName, inputs: { size?: IconSize; label?: string } = {}): SVGSVGElement {
  const fixture = TestBed.createComponent(Icon);
  fixture.componentRef.setInput("name", name);
  if (inputs.size !== undefined) fixture.componentRef.setInput("size", inputs.size);
  if (inputs.label !== undefined) fixture.componentRef.setInput("label", inputs.label);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector("svg")!;
}

describe("icons", () => {
  it("has exactly the 16 icons of the design system, in its order", () => {
    expect(ICON_NAMES).toEqual(Object.keys(README_TABLE));
    expect(new Set(ICON_NAMES).size).toBe(16);
    expect(Object.keys(ICONS).sort()).toEqual([...ICON_NAMES].sort());
  });

  it("recognises icon names and rejects anything else", () => {
    expect(isIconName("send-back")).toBe(true);
    expect(isIconName("Send-back")).toBe(false);
    expect(isIconName("toString")).toBe(false);
    expect(isIconName(3)).toBe(false);
  });
});

describe("ah-icon", () => {
  for (const name of ICON_NAMES) {
    it(`draws ${name} as an SVG line icon on the 24px grid`, () => {
      const svg = render(name);
      expect(svg.namespaceURI).toBe(SVG_NS);
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg.getAttribute("stroke")).toBe("currentColor");
      expect(svg.getAttribute("fill")).toBe("none");
      const shapes = svg.querySelectorAll("path, circle, rect");
      expect(shapes.length).toBe(ICONS[name].length);
      for (const shape of Array.from(shapes)) expect(shape.namespaceURI).toBe(SVG_NS);
    });
  }

  it("copies each shape's geometry", () => {
    const lock = render("lock");
    const rect = lock.querySelector("rect")!;
    expect([rect.getAttribute("x"), rect.getAttribute("y"), rect.getAttribute("width")]).toEqual(["5", "11", "14"]);
    expect(lock.querySelector("path")!.getAttribute("d")).toBe("M8 11V8a4 4 0 0 1 8 0v3");
    const info = render("info");
    expect(info.querySelector("circle")!.getAttribute("r")).toBe("9");
  });

  it("is 16px by default and 12px or 18px on request", () => {
    expect(render("check").getAttribute("width")).toBe("16");
    expect(render("check", { size: 12 }).getAttribute("height")).toBe("12");
    expect(render("check", { size: 18 }).getAttribute("width")).toBe("18");
  });

  it("is hidden from assistive technology unless it has a label", () => {
    const decorative = render("anchor");
    expect(decorative.getAttribute("aria-hidden")).toBe("true");
    expect(decorative.hasAttribute("role")).toBe(false);
    expect(decorative.hasAttribute("aria-label")).toBe(false);

    const alone = render("close", { label: "Close" });
    expect(alone.hasAttribute("aria-hidden")).toBe(false);
    expect(alone.getAttribute("role")).toBe("img");
    expect(alone.getAttribute("aria-label")).toBe("Close");
  });
});
