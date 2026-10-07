import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { AiuPipe } from "./aiu.pipe";

@Component({
  imports: [AiuPipe],
  template: `
    <span id="list">{{ nano() | ahAiu }}</span>
    <span id="run">{{ nano() | ahAiu: 2 }}</span>
    <span id="whole">{{ nano() | ahAiu: 0 }}</span>
  `,
})
class Host {
  readonly nano = signal<number | null | undefined>(12_400_000_000);
}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const text = (id: string) => root.querySelector(`#${id}`)!.textContent;
  return { fixture, text };
}

describe("ahAiu", () => {
  it("shows one decimal by default and as many as asked", () => {
    const { text } = render();
    expect(text("list")).toBe("12.4");
    expect(text("run")).toBe("12.40");
    expect(text("whole")).toBe("12");
  });

  it("follows the value without going through a float", () => {
    const { fixture, text } = render();
    fixture.componentInstance.nano.set(3_840_000_000);
    fixture.detectChanges();
    expect(text("run")).toBe("3.84");
    fixture.componentInstance.nano.set(1);
    fixture.detectChanges();
    expect(text("list")).toBe("0.0");
    expect(text("run")).toBe("0.00");
  });

  it("gives an em dash for a missing value and for one that is not a safe integer", () => {
    const { fixture, text } = render();
    for (const value of [null, undefined, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      fixture.componentInstance.nano.set(value);
      fixture.detectChanges();
      expect(text("list")).toBe("—");
    }
  });
});
