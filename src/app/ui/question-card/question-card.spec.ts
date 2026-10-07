import { Component, signal } from "@angular/core";
import type { ComponentFixture } from "@angular/core/testing";
import { TestBed } from "@angular/core/testing";
import { FormControl } from "@angular/forms";
import { absoluteTime } from "@domain/time";
import type { QuestionAnswer, QuestionRecommendation } from "./question-card";
import { QuestionCard } from "./question-card";

const REC: QuestionRecommendation = {
  agent: "Cartographer",
  text: "Receipt page only for now; bulk download is better as its own story.",
};

@Component({
  imports: [QuestionCard],
  template: `
    <ah-question-card
      questionId="Q2"
      [round]="1"
      text="Where should the download be offered?"
      [recommendation]="rec()"
      [answer]="answer()"
      [disabled]="disabled()"
      disabledReason="The voyage isn't waiting for answers."
      [control]="control"
      actor="alex@example.com"
      [busy]="busy()"
      (useRecommendation)="used.push($event)"
      (send)="sent.push($event)"
    />
  `,
})
class Host {
  readonly rec = signal<QuestionRecommendation | null>(REC);
  readonly answer = signal<QuestionAnswer | null>(null);
  readonly disabled = signal(false);
  readonly busy = signal(false);
  readonly control = new FormControl("", { nonNullable: true });
  readonly used: string[] = [];
  readonly sent: string[] = [];
}

let fixture: ComponentFixture<Host>;

async function render(): Promise<{ root: HTMLElement; host: Host }> {
  fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return { root: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

function buttonNamed(root: HTMLElement, name: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll("button")).find((b) => b.textContent!.trim() === name);
}

describe("ah-question-card", () => {
  it("shows an open question with its id, round, ring, recommendation and labelled answer field", async () => {
    const { root } = await render();
    const card = root.querySelector("article")!;
    expect(card.className).toBe("ah-question ah-question--open");
    expect(card.querySelector(".ah-question__id")!.textContent).toBe("Q2");
    expect(card.querySelector(".ah-badge")!.textContent).toBe("Needs an answer");
    expect(card.querySelector(".ah-question__head .ah-hint")!.textContent).toBe("Round 1");
    const text = card.querySelector(".ah-question__text")!;
    expect(card.getAttribute("aria-labelledby")).toBe(text.id);
    expect(card.querySelector(".ah-question__rec")!.textContent).toContain("Cartographer recommends:");
    const textarea = card.querySelector("textarea")!;
    expect(card.querySelector(`label[for="${textarea.id}"]`)!.textContent).toBe("Your answer");
    const hint = card.querySelector(`#${textarea.getAttribute("aria-describedby")!}`)!;
    expect(hint.textContent).toBe("Answers are final once sent. Recorded as alex@example.com.");
    expect(card.querySelector(".ah-question__final")).toBeNull();
  });

  it("'Use recommendation' fills the answer and never sends", async () => {
    const { root, host } = await render();
    buttonNamed(root, "Use recommendation")!.click();
    await fixture.whenStable();
    expect(host.control.value).toBe(REC.text);
    expect(host.control.dirty).toBe(true);
    expect(root.querySelector("textarea")!.value).toBe(REC.text);
    expect(document.activeElement).toBe(root.querySelector("textarea"));
    expect(host.used).toEqual([REC.text]);
    expect(host.sent).toEqual([]);
  });

  it("sends the trimmed answer only when it isn't blank", async () => {
    const { root, host } = await render();
    const send = buttonNamed(root, "Send answer")!;
    expect(send.disabled).toBe(true);
    send.click();
    host.control.setValue("   ");
    await fixture.whenStable();
    expect(send.disabled).toBe(true);
    const textarea = root.querySelector("textarea")!;
    textarea.value = "  On the total.  ";
    textarea.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    expect(send.disabled).toBe(false);
    send.click();
    expect(host.sent).toEqual(["On the total."]);
  });

  it("can't send twice while busy, nor while the control is disabled", async () => {
    const { root, host } = await render();
    host.control.setValue("On the total.");
    host.busy.set(true);
    await fixture.whenStable();
    const send = root.querySelector<HTMLButtonElement>(".ah-question__send button")!;
    expect(send.textContent!.trim()).toBe("Sending…");
    expect(send.disabled).toBe(true);
    expect(buttonNamed(root, "Use recommendation")!.disabled).toBe(true);
    send.click();
    host.busy.set(false);
    host.control.disable();
    await fixture.whenStable();
    expect(send.disabled).toBe(true);
    expect(host.sent).toEqual([]);
  });

  it("shows a final answer with who and when, a lock, and nothing to edit", async () => {
    const { root, host } = await render();
    const at = "2026-10-06T09:12:00Z";
    host.answer.set({ text: "Include the VAT number.", actor: "sam@example.com", at, note: "used the recommendation" });
    await fixture.whenStable();
    const card = root.querySelector("article")!;
    expect(card.className).toBe("ah-question");
    expect(card.querySelector(".ah-badge")!.textContent).toBe("Answered");
    expect(card.querySelector(".ah-question__final")!.textContent).toBe("Final");
    expect(card.querySelector(".ah-question__final svg")!.getAttribute("data-icon")).toBe("lock");
    const answer = card.querySelector(".ah-question__answer")!;
    expect(answer.firstElementChild!.textContent).toBe("Include the VAT number.");
    expect(answer.querySelector(".ah-hint")!.textContent).toBe(
      `sam@example.com · ${absoluteTime(at)} · used the recommendation`,
    );
    expect(card.querySelector("textarea, input, button, .ah-question__rec")).toBeNull();
  });

  it("shows the system as Ahoy in an answer", async () => {
    const { root, host } = await render();
    host.answer.set({ text: "Default", actor: "ahoy-reconciler", at: "2026-10-06T09:12:00Z" });
    await fixture.whenStable();
    expect(root.querySelector(".ah-question__answer .ah-hint")!.textContent).toMatch(/^Ahoy · /);
  });

  it("shows a disabled question without a form or ring, with the reason", async () => {
    const { root, host } = await render();
    host.disabled.set(true);
    await fixture.whenStable();
    const card = root.querySelector("article")!;
    expect(card.className).toBe("ah-question");
    expect(card.querySelector("textarea, button")).toBeNull();
    expect(card.querySelector(".ah-question__rec")).not.toBeNull();
    expect(card.querySelector(".ah-question__form .ah-hint")!.textContent).toBe(
      "The voyage isn't waiting for answers.",
    );
  });

  it("renders agent text as text, never as HTML", async () => {
    const { root, host } = await render();
    host.rec.set({ agent: "Cartographer", text: '<img src=x onerror="alert(1)">' });
    await fixture.whenStable();
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".ah-question__rec")!.textContent).toContain('<img src=x onerror="alert(1)">');
  });
});
