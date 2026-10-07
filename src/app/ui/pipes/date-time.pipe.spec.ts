import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { DateTimePipe } from "./date-time.pipe";

@Component({ imports: [DateTimePipe], template: `<span>{{ at() | ahDateTime }}</span>` })
class Host {
  readonly at = signal<string | Date | null | undefined>(null);
}

function show(at: string | Date | null | undefined): string {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.at.set(at);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent;
}

describe("ahDateTime", () => {
  it("shows the weekday and the time, in the browser's time zone", () => {
    // A local-time constructor, so the expected text does not depend on the machine's zone: 7 Oct 2026 is a Wednesday.
    expect(show(new Date(2026, 9, 7, 9, 48))).toBe("Wed 09:48");
    expect(show(new Date(2026, 9, 6, 23, 5).toISOString())).toBe("Tue 23:05");
  });

  it("gives an em dash for a missing or invalid time", () => {
    expect(show(null)).toBe("—");
    expect(show(undefined)).toBe("—");
    expect(show("yesterday-ish")).toBe("—");
  });
});
