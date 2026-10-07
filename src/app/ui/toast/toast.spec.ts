import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MAX_TOASTS, TOAST_DURATION_MS, ToastHost, ToastService } from "./toast";

@Component({ imports: [ToastHost], template: `<ah-toast-host />` })
class Host {}

function render() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const service = TestBed.inject(ToastService);
  const texts = () => Array.from(root.querySelectorAll(".ah-toast > span")).map((s) => s.textContent);
  return { fixture, root, service, texts };
}

describe("toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps an empty live region in the page, so a screen reader hears each toast as it arrives", () => {
    const { root, texts } = render();
    const region = root.querySelector(".ah-toast-host")!;
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-atomic")).toBe("false");
    expect(texts()).toEqual([]);
  });

  it("shows a confirmation with a check mark and the text, in the preview's markup", () => {
    const { fixture, root, service } = render();
    service.show("Answer to Q2 sent. 1 question left.");
    fixture.detectChanges();
    const toast = root.querySelector(".ah-toast")!;
    expect(toast.className).toBe("ah-toast");
    expect(toast.querySelector("svg")!.getAttribute("data-icon")).toBe("check");
    expect(toast.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(toast.querySelector("span")!.textContent).toBe("Answer to Q2 sent. 1 question left.");
    expect(root.querySelector(".ah-toast-host")!.contains(toast)).toBe(true);
  });

  it("disappears after about 5 seconds, not before", () => {
    const { fixture, service, texts } = render();
    service.show("Voyage PROJ-145 set sail.");
    fixture.detectChanges();
    vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    fixture.detectChanges();
    expect(texts()).toEqual(["Voyage PROJ-145 set sail."]);
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(texts()).toEqual([]);
    expect(TOAST_DURATION_MS).toBe(5000);
  });

  it("times each toast from when it was shown", () => {
    const { fixture, service, texts } = render();
    service.show("First.");
    vi.advanceTimersByTime(3000);
    service.show("Second.");
    fixture.detectChanges();
    expect(texts()).toEqual(["First.", "Second."]);
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(texts()).toEqual(["Second."]);
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(texts()).toEqual([]);
  });

  it("never holds an action: no button or link in a toast", () => {
    const { fixture, root, service } = render();
    service.show("Models saved. Applies from each phase's next run.");
    fixture.detectChanges();
    expect(root.querySelector(".ah-toast button, .ah-toast a, .ah-toast [tabindex]")).toBeNull();
  });

  it("ignores blank text and trims the rest", () => {
    const { fixture, service, texts } = render();
    service.show("");
    service.show("   ");
    service.show("  Plan sent back.  ");
    fixture.detectChanges();
    expect(texts()).toEqual(["Plan sent back."]);
  });

  it("shows no more than three at once, pushing the oldest out", () => {
    const { fixture, service, texts } = render();
    for (const n of [1, 2, 3, 4]) service.show(`Toast ${n}.`);
    fixture.detectChanges();
    expect(MAX_TOASTS).toBe(3);
    expect(texts()).toEqual(["Toast 2.", "Toast 3.", "Toast 4."]);
  });

  describe("timers", () => {
    /** The handles of the timers the service started (the framework starts its own, with other delays). */
    function toastTimers(set: { mock: { calls: unknown[][]; results: { value: unknown }[] } }): unknown[] {
      return set.mock.results.filter((_, i) => set.mock.calls[i]![1] === TOAST_DURATION_MS).map((r) => r.value);
    }

    afterEach(() => vi.restoreAllMocks());

    it("clears the timer of a toast it pushes out", () => {
      const set = vi.spyOn(globalThis, "setTimeout");
      const clear = vi.spyOn(globalThis, "clearTimeout");
      const { service } = render();
      for (const n of [1, 2, 3, 4]) service.show(`Toast ${n}.`);
      const handles = toastTimers(set);
      expect(handles.length).toBe(4);
      expect(clear).toHaveBeenCalledWith(handles[0]);
      expect(clear).not.toHaveBeenCalledWith(handles[1]);
    });

    it("clears every pending timer when the service is destroyed", () => {
      const set = vi.spyOn(globalThis, "setTimeout");
      const clear = vi.spyOn(globalThis, "clearTimeout");
      const { service } = render();
      service.show("One.");
      service.show("Two.");
      const [one, two] = toastTimers(set);
      TestBed.resetTestingModule();
      expect(clear).toHaveBeenCalledWith(one);
      expect(clear).toHaveBeenCalledWith(two);
      expect(() => vi.advanceTimersByTime(TOAST_DURATION_MS)).not.toThrow();
    });
  });

  it("is one service for the whole app, so any feature can show a toast", () => {
    render();
    expect(TestBed.inject(ToastService)).toBe(TestBed.inject(ToastService));
  });
});
