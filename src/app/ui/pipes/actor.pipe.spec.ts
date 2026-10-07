import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActorPipe } from "./actor.pipe";

@Component({ imports: [ActorPipe], template: `<span>{{ actor() | ahActor }}</span>` })
class Host {
  readonly actor = signal<string | null | undefined>(null);
}

function show(actor: string | null | undefined): string {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.actor.set(actor);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent;
}

describe("ahActor", () => {
  it("shows the system's reconciler as Ahoy", () => {
    expect(show("ahoy-reconciler")).toBe("Ahoy");
  });

  it("shows a person as their e-mail", () => {
    expect(show("alex@example.com")).toBe("alex@example.com");
  });

  it("gives an em dash when there is no actor", () => {
    expect(show(null)).toBe("—");
    expect(show(undefined)).toBe("—");
    expect(show("")).toBe("—");
  });
});
