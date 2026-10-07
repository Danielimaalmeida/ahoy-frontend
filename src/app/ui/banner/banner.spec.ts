import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Banner } from "./banner";

@Component({
  imports: [Banner],
  template: `
    <ah-banner id="notice" heading="This voyage changed since you opened it">We kept your text.</ah-banner>
    <ah-banner
      id="error"
      variant="error"
      heading="Anchored: the planning run failed before it started"
      tech="run_failed · r-03 · preflight: model not enabled for this account"
      ><span>No prompt was sent and no AIU was spent.</span></ah-banner
    >
    <ah-banner id="info" variant="info" [icon]="null" announce="status">Notes about this screen.</ah-banner>
    <ah-banner id="cost" variant="cost" heading="This may spend up to 10.2 AIU"
      >Billed to sam&#64;example.com.</ah-banner
    >
  `,
})
class Host {}

function render(): HTMLElement {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe("ah-banner", () => {
  it("renders a notice with the refresh icon, title and text, announced as an alert", () => {
    const banner = render().querySelector("#notice > div")!;
    expect(banner.className).toBe("ah-banner ah-banner--notice");
    expect(banner.getAttribute("role")).toBe("alert");
    const icon = banner.querySelector("svg")!;
    expect(icon.getAttribute("data-icon")).toBe("refresh");
    expect(icon.getAttribute("width")).toBe("18");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    const body = icon.parentElement!.nextElementSibling!;
    expect(body.className).toBe("");
    expect(body.querySelector(".ah-banner__title")!.textContent).toBe("This voyage changed since you opened it");
    expect(body.textContent).toContain("We kept your text.");
  });

  it("renders an error with the anchor icon and the technical line last", () => {
    const banner = render().querySelector("#error > div")!;
    expect(banner.className).toBe("ah-banner ah-banner--error");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.querySelector("svg")!.getAttribute("data-icon")).toBe("anchor");
    const body = banner.querySelector(".ah-banner__body")!;
    expect(Array.from(body.children).map((c) => c.className)).toEqual(["ah-banner__title", "", "ah-tech"]);
    expect(body.lastElementChild!.textContent).toBe(
      "run_failed · r-03 · preflight: model not enabled for this account",
    );
  });

  it("lets the page drop the icon and choose how it is announced", () => {
    const banner = render().querySelector("#info > div")!;
    expect(banner.className).toBe("ah-banner ah-banner--info");
    expect(banner.querySelector("svg")).toBeNull();
    expect(banner.getAttribute("role")).toBe("status");
  });

  it("renders the cost box with the amount in bold and who is billed as a hint", () => {
    const box = render().querySelector("#cost > div")!;
    expect(box.className).toBe("ah-cost");
    expect(box.hasAttribute("role")).toBe(false);
    expect(box.querySelector("b")!.textContent).toBe("This may spend up to 10.2 AIU");
    expect(box.querySelector(".ah-hint")!.textContent).toBe("Billed to sam@example.com.");
    expect(box.querySelector("svg")).toBeNull();
  });
});
