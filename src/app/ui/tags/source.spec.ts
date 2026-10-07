import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Source } from "./source";

@Component({
  imports: [Source],
  template: `
    <ah-source id="default">Server default</ah-source>
    <ah-source id="chosen" chosen>Chosen for this voyage</ah-source>
  `,
})
class Host {}

describe("ah-source", () => {
  it("tags where a value comes from, with the chosen variant", () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const inherited = root.querySelector("#default")!;
    const chosen = root.querySelector("#chosen")!;
    expect(inherited.className).toBe("ah-source");
    expect(inherited.textContent).toBe("Server default");
    expect(chosen.className.split(" ").sort()).toEqual(["ah-source", "ah-source--chosen"]);
    expect(chosen.textContent).toBe("Chosen for this voyage");
  });
});
