import type { ComponentFixture } from "@angular/core/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { THEME_STORAGE } from "@ui/theme/theme.service";
import { KIT_SECTIONS, Kit } from "./kit";

let fixture: ComponentFixture<Kit>;

async function render(): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: THEME_STORAGE, useValue: null }],
  });
  fixture = TestBed.createComponent(Kit);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe("kit gallery", () => {
  afterEach(() => document.documentElement.removeAttribute("data-theme"));

  it("shows every section under its own labelled heading", async () => {
    const root = await render();
    // Lane 1A's sections come first; lanes 1B and 1C append theirs (sections/<lane>-sections.ts).
    const ids = KIT_SECTIONS.map((s) => s.id);
    expect(ids.slice(0, 6)).toEqual(["brand", "button", "panel", "field", "banner", "table"]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of KIT_SECTIONS) {
      const section = root.querySelector(`section#${s.id}`)!;
      const title = section.querySelector("h2")!;
      expect(title.textContent).toContain(s.title);
      expect(section.getAttribute("aria-labelledby")).toBe(title.id);
      expect(section.children.length).toBeGreaterThan(1);
    }
  });

  it("switches between the light and dark themes", async () => {
    const root = await render();
    const [light, dark] = Array.from(root.querySelectorAll<HTMLButtonElement>('[aria-label="Theme"] button'));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(light!.getAttribute("aria-pressed")).toBe("true");
    expect(dark!.getAttribute("aria-pressed")).toBe("false");
    dark!.click();
    await fixture.whenStable();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(dark!.getAttribute("aria-pressed")).toBe("true");
    expect(dark!.classList.contains("ah-btn--soft")).toBe(true);
  });

  it("shows the field error of the preview on load", async () => {
    const root = await render();
    const errors = Array.from(root.querySelectorAll("#field .ah-field__error")).map((e) => e.textContent);
    expect(errors).toEqual(["At least 12.4 AIU, what's already spent."]);
  });

  it("shows all 16 icons", async () => {
    const root = await render();
    expect(root.querySelectorAll("#brand .kit-icons svg").length).toBe(16);
  });
});
