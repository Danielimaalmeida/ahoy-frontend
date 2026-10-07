import { readStoryState } from "@core/api/story-state";
import type { Question } from "@core/api/types";
import { aStory, anEvent } from "@core/realtime/testing/events";
import { blockedAt, chipCounts, filterOf, haltOf, matchesQuery, noteFor, rejectionOf, type NoteDetail } from "./notes";

const NONE: NoteDetail = { questions: null, state: null, halt: null, rejection: null };

function question(id: string, answered: boolean, round = 1): Question {
  return {
    id,
    round,
    runId: "proj-131-planning-001-aaaa",
    text: `Question ${id}?`,
    recommendation: null,
    answer: answered ? "An answer." : null,
    answeredBy: answered ? "sam@example.com" : null,
    answeredAt: answered ? "2026-10-06T09:30:00.000Z" : null,
    consumed: false,
  };
}

describe("noteFor: a voyage the crew works on", () => {
  it("names the crew member at work, and who goes next for a queued one", () => {
    expect(noteFor(aStory("PROJ-140", { status: "running", phase: "planning" }), NONE)).toBe("Cartographer at work");
    expect(noteFor(aStory("PROJ-141", { status: "running", phase: "pr_review" }), NONE)).toBe("Lookouts at work");
    expect(noteFor(aStory("PROJ-109", { status: "ready", phase: "intake" }), NONE)).toBe("Navigator goes next");
  });
});

describe("noteFor: Crew asks", () => {
  const story = aStory("PROJ-131", { status: "awaiting_input", phase: "planning" });

  it("counts the open questions", () => {
    const questions = [question("Q1", true), question("Q2", false), question("Q3", false)];
    expect(noteFor(story, { ...NONE, questions })).toBe("2 open questions");
    expect(noteFor(story, { ...NONE, questions: [question("Q1", false)] })).toBe("1 open question");
  });

  it("does not count a question of an earlier round that was answered", () => {
    const questions = [question("Q1", true, 1), question("Q2", true, 1), question("Q3", false, 2)];
    expect(noteFor(story, { ...NONE, questions })).toBe("1 open question");
  });

  it("says the crew waits for answers while the questions are not read", () => {
    expect(noteFor(story, NONE)).toBe("Waiting for answers");
  });
});

describe("noteFor: Your orders", () => {
  const story = aStory("PROJ-123", { status: "awaiting_decision", phase: "plan_review" });

  it("says the plan waits for approval, in its revision round", () => {
    const state = readStoryState({ revisions: { plan_accepted: 1 }, revision_ceiling: 4 });
    expect(noteFor(story, { ...NONE, state })).toBe("Plan waiting for approval · round 2 of 4");
  });

  it("says only that the plan waits while the state is not read", () => {
    expect(noteFor(story, NONE)).toBe("Plan waiting for approval");
  });

  it("names the delivery at the delivery gate", () => {
    const delivery = aStory("PROJ-124", { status: "awaiting_decision", phase: "delivery_gate" });
    const state = readStoryState({});
    expect(noteFor(delivery, { ...NONE, state })).toBe("Delivery waiting for approval · round 1 of 4");
  });

  it("says a decision waits when the phase has no gate it knows", () => {
    const other = aStory("PROJ-125", { status: "awaiting_decision", phase: "something_new" });
    expect(noteFor(other, NONE)).toBe("A decision is waiting");
  });
});

describe("noteFor: Anchored", () => {
  it("names the person who stopped it", () => {
    const story = aStory("PROJ-126", { status: "halted", haltReason: "stopped_by_user" });
    expect(
      noteFor(story, { ...NONE, halt: { reason: "stopped_by_user", detail: "x", actor: "priya@example.com" } }),
    ).toBe("Stopped by priya@example.com");
    expect(noteFor(story, NONE)).toBe("Stopped by a person");
  });

  it("says Ahoy when the system anchored it for that reason", () => {
    const story = aStory("PROJ-126", { status: "halted", haltReason: "stopped_by_user" });
    expect(
      noteFor(story, { ...NONE, halt: { reason: "stopped_by_user", detail: null, actor: "ahoy-reconciler" } }),
    ).toBe("Stopped by Ahoy");
  });

  it("uses the short text of any other halt reason", () => {
    const story = aStory("PROJ-118", { status: "halted", haltReason: "budget_exhausted" });
    expect(noteFor(story, NONE)).toBe("The voyage has spent its whole AIU budget.");
  });

  it("shows a reason it does not know as the API sent it, and says anchored when there is none", () => {
    expect(noteFor(aStory("PROJ-119", { status: "halted", haltReason: "cosmic_rays" }), NONE)).toBe("cosmic_rays");
    expect(noteFor(aStory("PROJ-120", { status: "halted", haltReason: null }), NONE)).toBe("The voyage is anchored");
  });
});

describe("noteFor: In port", () => {
  it("says a docked voyage was delivered", () => {
    expect(noteFor(aStory("PROJ-097", { status: "terminal", phase: "done" }), NONE)).toBe("Delivered");
  });

  it("says who rejected what for an aground voyage", () => {
    const story = aStory("PROJ-102", { status: "terminal", phase: "blocked" });
    expect(noteFor(story, { ...NONE, rejection: { actor: "jordan@example.com", gate: "plan_accepted" } })).toBe(
      "Plan rejected by jordan@example.com",
    );
    expect(noteFor(story, { ...NONE, rejection: { actor: "jordan@example.com", gate: "delivery_accepted" } })).toBe(
      "Delivery rejected by jordan@example.com",
    );
    expect(noteFor(story, { ...NONE, rejection: { actor: "jordan@example.com", gate: "new_gate" } })).toBe(
      "Decision rejected by jordan@example.com",
    );
  });

  it("says it ran aground when no rejection is known", () => {
    expect(noteFor(aStory("PROJ-102", { status: "terminal", phase: "blocked" }), NONE)).toBe("Ran aground");
  });
});

describe("blockedAt", () => {
  it("reads the phase a voyage was in from the last story.phase_changed (G12)", () => {
    const events = [
      anEvent(1, "story.phase_changed", { from: "intake", to: "planning" }),
      anEvent(2, "story.phase_changed", { from: "planning", to: "plan_review" }),
      anEvent(3, "story.phase_changed", { from: "plan_review", to: "blocked" }),
      anEvent(4, "run.queued", {}),
    ];
    expect(blockedAt(events)).toBe("plan_review");
  });

  it("gives null when there is none or `from` is not text", () => {
    expect(blockedAt([])).toBeNull();
    expect(blockedAt([anEvent(1, "story.phase_changed", { from: 3 })])).toBeNull();
  });
});

describe("rejectionOf", () => {
  it("reads who rejected and at which gate from the last rejecting decision", () => {
    const events = [
      anEvent(1, "decision.recorded", { gate: "plan_accepted", decision: "send_back" }),
      {
        ...anEvent(2, "decision.recorded", { gate: "plan_accepted", decision: "reject" }),
        actor: "jordan@example.com",
      },
    ];
    expect(rejectionOf(events)).toEqual({ actor: "jordan@example.com", gate: "plan_accepted" });
  });

  it("gives null when nobody rejected, and keeps the gate empty when the payload has none", () => {
    expect(rejectionOf([anEvent(1, "decision.recorded", { gate: "plan_accepted", decision: "approve" })])).toBeNull();
    expect(rejectionOf([anEvent(1, "decision.recorded", { decision: "reject" })])?.gate).toBeNull();
  });
});

describe("haltOf", () => {
  it("reads the reason, the detail and the actor of the last story.halted event", () => {
    const events = [
      {
        ...anEvent(1, "story.halted", { reason: "stopped_by_user", detail: " Waiting. " }),
        actor: "priya@example.com",
      },
    ];
    expect(haltOf(events)).toEqual({ reason: "stopped_by_user", detail: "Waiting.", actor: "priya@example.com" });
    expect(haltOf([])).toBeNull();
  });
});

describe("filterOf", () => {
  it("accepts the six statuses the API has", () => {
    for (const status of ["ready", "running", "awaiting_input", "awaiting_decision", "halted", "terminal"]) {
      expect(filterOf(status)).toBe(status);
    }
  });

  it("reads anything else, which comes from the address bar, as All", () => {
    for (const raw of [undefined, null, "", "all", "HALTED", "halted,ready", "<script>", 3, ["halted"], {}]) {
      expect(filterOf(raw)).toBe("all");
    }
  });
});

describe("matchesQuery", () => {
  const story = aStory("PROJ-123", { title: "Show invoice due date on the billing page" });

  it("matches the key or the title, ignoring case and the spaces around the text", () => {
    expect(matchesQuery(story, "proj-123")).toBe(true);
    expect(matchesQuery(story, "  INVOICE ")).toBe(true);
    expect(matchesQuery(story, "123")).toBe(true);
    expect(matchesQuery(story, "billing page")).toBe(true);
  });

  it("does not match text that is in neither", () => {
    expect(matchesQuery(story, "receipts")).toBe(false);
    expect(matchesQuery(story, "PROJ-999")).toBe(false);
  });

  it("matches everything for an empty query, and a voyage with no title by its key only", () => {
    expect(matchesQuery(story, "")).toBe(true);
    expect(matchesQuery(story, "   ")).toBe(true);
    const bare = aStory("PROJ-200", { title: null });
    expect(matchesQuery(bare, "proj-2")).toBe(true);
    expect(matchesQuery(bare, "null")).toBe(false);
  });

  it("takes the text literally, not as a pattern", () => {
    expect(matchesQuery(story, ".*")).toBe(false);
    expect(matchesQuery(aStory("PROJ-1", { title: "Fix (all) the [things]" }), "(all) the [")).toBe(true);
  });
});

describe("chipCounts", () => {
  const stories = [
    aStory("PROJ-1", { status: "running", title: "Alpha" }),
    aStory("PROJ-2", { status: "halted", title: "Alpha two" }),
    aStory("PROJ-3", { status: "halted", title: "Beta" }),
    aStory("PROJ-4", { status: "terminal", phase: "done", title: "Alpha three" }),
    aStory("PROJ-5", { status: "terminal", phase: "blocked", title: "Gamma" }),
  ];

  it("counts all of them and each status, with In port as terminal", () => {
    expect(chipCounts(stories, "")).toEqual({
      all: 5,
      ready: 0,
      running: 1,
      awaiting_input: 0,
      awaiting_decision: 0,
      halted: 2,
      terminal: 2,
    });
  });

  it("counts what the search leaves, so a chip says what pressing it would show", () => {
    expect(chipCounts(stories, "alpha")).toEqual({
      all: 3,
      ready: 0,
      running: 1,
      awaiting_input: 0,
      awaiting_decision: 0,
      halted: 1,
      terminal: 1,
    });
  });
});
