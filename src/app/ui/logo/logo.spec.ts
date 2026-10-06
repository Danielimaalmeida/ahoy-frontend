import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { Logo } from "./logo";

/** Renders the logo with an optional `link` and returns the host element. */
function render(link?: string | null): HTMLElement {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Logo);
  if (link !== undefined) fixture.componentRef.setInput("link", link);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe("ah-logo", () => {
  it("links the wheel mark and the word Ahoy to the home page", () => {
    const logo = render().querySelector("a.ah-logo")!;
    expect(logo.getAttribute("href")).toBe("/");
    expect(logo.textContent?.trim()).toBe("Ahoy");
    const mark = logo.querySelector("svg")!;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.getAttribute("stroke")).toBe("currentColor");
    expect(mark.querySelectorAll("circle").length).toBe(2);
  });

  it("links elsewhere or nowhere on request", () => {
    expect(render("/voyages").querySelector("a.ah-logo")!.getAttribute("href")).toBe("/voyages");
    TestBed.resetTestingModule();
    const plain = render(null);
    expect(plain.querySelector("a")).toBeNull();
    expect(plain.querySelector("span.ah-logo")!.textContent?.trim()).toBe("Ahoy");
  });
});
