import { Component, signal } from "@angular/core";
import type { ComponentFixture } from "@angular/core/testing";
import { TestBed } from "@angular/core/testing";
import { ArtifactDiff, Mark, diffBlocks } from "./artifact-diff";

const PREVIOUS = [
  "# Plan",
  "",
  "## Summary",
  "",
  "Show each invoice's due date on the billing page,",
  "in the server's timezone.",
  "",
  "## Work",
  "",
  "- WP1",
].join("\n");

const NEXT = PREVIOUS.replace("in the server's timezone.", "in the customer's timezone, with a clear overdue state.");

@Component({
  imports: [ArtifactDiff, Mark],
  template: `
    <ah-artifact-diff [previous]="previous()" [next]="next()" label="Plan, revision 3 to 4" />
    <p>WP1 now <span id="m1" ahMark>computes isOverdue</span> and <span id="m2" [ahMark]="marked()">this</span>.</p>
  `,
})
class Host {
  readonly previous = signal(PREVIOUS);
  readonly next = signal(NEXT);
  readonly marked = signal(false);
}

let fixture: ComponentFixture<Host>;

async function render(): Promise<{ root: HTMLElement; host: Host }> {
  fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return { root: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

describe("ah-artifact-diff", () => {
  it("shows a hunk named after its section, with numbered lines and +/− signs", async () => {
    const { root } = await render();
    const diff = root.querySelector(".ah-diff")!;
    expect(diff.getAttribute("aria-label")).toBe("Plan, revision 3 to 4");
    const rows = Array.from(diff.children);
    expect(rows[0]!.className).toBe("ah-diff__hunk");
    expect(rows[0]!.textContent).toBe("@@ Summary @@");
    const lines = rows
      .slice(1)
      .map((r) => [r.className, r.querySelector(".ah-diff__ln")!.textContent, r.lastElementChild!.textContent]);
    // The context stays inside the section: the header names it, so neither heading is repeated as a line.
    expect(lines).toEqual([
      ["", "4", ""],
      ["", "5", "Show each invoice's due date on the billing page,"],
      ["ah-diff__del", "6", "− in the server's timezone."],
      ["ah-diff__add", "6", "+ in the customer's timezone, with a clear overdue state."],
      ["", "7", ""],
    ]);
  });

  it("says when the revisions are the same", async () => {
    const { root, host } = await render();
    host.next.set(PREVIOUS);
    await fixture.whenStable();
    expect(root.querySelector(".ah-diff")).toBeNull();
    expect(root.querySelector("ah-artifact-diff")!.textContent!.trim()).toBe("No changes between these revisions.");
  });

  it("shows revision text as text", async () => {
    const { root, host } = await render();
    host.next.set(`${PREVIOUS}\n<img src=x onerror="alert(1)">`);
    await fixture.whenStable();
    expect(root.querySelector(".ah-diff img")).toBeNull();
    const added = Array.from(root.querySelectorAll(".ah-diff__add")).map((r) => r.lastElementChild!.textContent);
    expect(added).toContain('+ <img src=x onerror="alert(1)">');
  });
});

describe("ahMark", () => {
  it("adds ah-mark when bare or true", async () => {
    const { root, host } = await render();
    expect(root.querySelector("#m1")!.className).toBe("ah-mark");
    expect(root.querySelector("#m2")!.className).toBe("");
    host.marked.set(true);
    await fixture.whenStable();
    expect(root.querySelector("#m2")!.className).toBe("ah-mark");
  });
});

describe("diffBlocks", () => {
  it("numbers removed lines in the old revision and the rest in the new one", () => {
    const blocks = diffBlocks("a\nb\nc\n", "a\nx\ny\nc\n", 1);
    expect(blocks).toEqual([
      {
        header: "@@ @@",
        rows: [
          { kind: "same", number: 1, display: "a" },
          { kind: "remove", number: 2, display: "− b" },
          { kind: "add", number: 2, display: "+ x" },
          { kind: "add", number: 3, display: "+ y" },
          { kind: "same", number: 4, display: "c" },
        ],
      },
    ]);
  });

  it("splits distant changes into hunks and finds nothing between equal texts", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    const after = before.replace("line 2", "LINE 2").replace("line 19", "LINE 19");
    expect(diffBlocks(before, after).map((b) => b.rows.find((r) => r.kind === "add")!.number)).toEqual([2, 19]);
    expect(diffBlocks(before, before)).toEqual([]);
  });
});
