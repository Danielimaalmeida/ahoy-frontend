import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { Api, CellSub, Key, Nowrap, Table } from "./table";

@Component({
  imports: [Table, Nowrap, Key, Api, CellSub],
  template: `
    <table ahTable class="extra">
      <thead>
        <tr>
          <th ahNowrap>Status</th>
          <th>Voyage</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td ahNowrap>Your orders <span ahApi>awaiting_decision</span></td>
          <td>
            <a ahKey href="/voyages/PROJ-123">PROJ-123</a>Show invoice due date
            <span ahCellSub>Gate plan_accepted · round 2 of 4</span>
          </td>
        </tr>
      </tbody>
    </table>
  `,
})
class Host {}

describe("table helpers", () => {
  it("add the bundle classes and keep the element's own", () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector("table")!.className.split(" ").sort()).toEqual(["ah-table", "extra"]);
    expect(root.querySelectorAll(".ah-nowrap").length).toBe(2);
    expect(root.querySelector("a.ah-key")!.getAttribute("href")).toBe("/voyages/PROJ-123");
    expect(root.querySelector("span.ah-api")!.textContent).toBe("awaiting_decision");
    expect(root.querySelector("span.ah-cell-sub")!.textContent).toBe("Gate plan_accepted · round 2 of 4");
  });
});
