import type { GateRecord } from "@core/api/types";
import {
  PLAN_GATE,
  choiceOptions,
  confirmLabel,
  decidedRecord,
  decisionBody,
  decisionToast,
  earlierSendBack,
  outcomeWord,
  roundText,
  sendBackLead,
} from "./decision-view";

function record(over: Partial<GateRecord> & { id: string }): GateRecord {
  return {
    source: "human",
    gate: PLAN_GATE,
    phase: "plan_review",
    outcome: "send_back",
    message: null,
    actor: "jordan@example.com",
    runId: null,
    createdAt: "2026-10-05T16:40:00Z",
    ...over,
  };
}

describe("choiceOptions", () => {
  it("offers Approve, Send back and Reject with what each one does, in the crew's words", () => {
    const options = choiceOptions("Cartographer", 2, 4);
    expect(options.map((o) => [o.value, o.title])).toEqual([
      ["approve", "Approve"],
      ["send_back", "Send back"],
      ["reject", "Reject"],
    ]);
    expect(options[0]?.description).toBe("The voyage moves on to implementation.");
    expect(options[1]?.description).toBe("Cartographer revises the plan. This would be round 3 of 4.");
    expect(options[2]?.description).toBe("The voyage runs aground (blocked). This can't be undone here.");
  });
});

describe("roundText", () => {
  it("counts the round the send-back would start", () => {
    expect(roundText("Cartographer", 1, 4)).toBe("Cartographer revises the plan. This would be round 2 of 4.");
    expect(roundText("Cartographer", 3, 4)).toBe("Cartographer revises the plan. This would be round 4 of 4.");
  });

  it("says what happens past the ceiling, where Ahoy may refuse another round", () => {
    const text = roundText("Cartographer", 4, 4);
    expect(text).toContain("round 5");
    expect(text).toContain("past the 4 rounds");
    expect(text).toContain("anchors");
  });

  it("leaves the count out while the round or the ceiling is not read", () => {
    expect(roundText("Cartographer", null, 4)).toBe("Cartographer revises the plan.");
    expect(roundText("Cartographer", 2, null)).toBe("Cartographer revises the plan.");
  });
});

describe("sendBackLead", () => {
  it("says which round it starts and what follows the last one", () => {
    expect(sendBackLead(2, 4)).toBe(
      "This starts revision round 3 of 4. After round 4 the voyage anchors and needs a person to decide.",
    );
    expect(sendBackLead(3, 4)).toContain("round 4 of 4");
  });

  it("explains a send-back past the ceiling instead of promising a round", () => {
    const text = sendBackLead(4, 4);
    expect(text).toContain("revision round 5");
    expect(text).toContain("may refuse it");
  });

  it("only says what a send-back does while the round is not read", () => {
    expect(sendBackLead(null, 4)).toBe("This starts another revision round.");
  });
});

describe("confirmLabel", () => {
  it("names the choice on the button", () => {
    expect(confirmLabel("approve", "Cartographer")).toBe("Approve plan");
    expect(confirmLabel("send_back", "Cartographer")).toBe("Send back to Cartographer");
    expect(confirmLabel("reject", "Cartographer")).toBe("Reject plan");
  });
});

describe("decisionBody", () => {
  it("sends the gate, the decision, the trimmed reason and the version", () => {
    expect(decisionBody("plan_accepted", "send_back", "  Use the customer's timezone.  ", 7)).toEqual({
      gate: "plan_accepted",
      decision: "send_back",
      reason: "Use the customer's timezone.",
      expectedVersion: 7,
    });
  });

  it("leaves the reason out of an approval, even if one was typed, and out of an empty one", () => {
    expect(decisionBody("plan_accepted", "approve", "typed before switching", 7)).toEqual({
      gate: "plan_accepted",
      decision: "approve",
      expectedVersion: 7,
    });
    expect("reason" in decisionBody("plan_accepted", "reject", "   ", 7)).toBe(false);
  });
});

describe("decisionToast", () => {
  it("says in the past tense what was decided and what happens next", () => {
    expect(decisionToast("send_back", "Cartographer", 2, 4)).toBe(
      "Plan sent back to Cartographer. Round 3 of 4 is under way.",
    );
    expect(decisionToast("approve", "Cartographer", 2, 4)).toBe(
      "Plan approved. The voyage moves on to implementation.",
    );
    expect(decisionToast("reject", "Cartographer", 2, 4)).toBe("Plan rejected. The voyage ran aground.");
  });

  it("does not claim a round of a ceiling the send-back went past", () => {
    expect(decisionToast("send_back", "Cartographer", 4, 4)).toBe(
      "Plan sent back to Cartographer. Round 5 is under way.",
    );
    expect(decisionToast("send_back", "Cartographer", null, null)).toBe("Plan sent back to Cartographer.");
  });
});

describe("outcomeWord", () => {
  it("uses the past tense of each decision", () => {
    expect(outcomeWord("approve")).toBe("approved");
    expect(outcomeWord("send_back")).toBe("sent back");
    expect(outcomeWord("reject")).toBe("rejected");
  });

  it("gives an outcome that is not a decision no word", () => {
    expect(outcomeWord("pass")).toBeNull();
  });
});

describe("decidedRecord", () => {
  it("is the last human decision on the gate that settled it (approve or reject, not a send-back)", () => {
    const records = [
      record({ id: "g1", outcome: "send_back" }),
      record({ id: "g2", source: "gate", gate: "plan", outcome: "pass", actor: "ahoy-reconciler" }),
      record({ id: "g3", outcome: "approve", actor: "alex@example.com" }),
    ];
    expect(decidedRecord(records, PLAN_GATE)?.id).toBe("g3");
  });

  it("is the last human decision of any kind when asked for it, for the conflict panel", () => {
    const records = [record({ id: "g1", outcome: "approve" }), record({ id: "g2", outcome: "send_back" })];
    expect(decidedRecord(records, PLAN_GATE, { settledOnly: false })?.id).toBe("g2");
  });

  it("is null when no person decided that gate", () => {
    expect(decidedRecord([record({ id: "g1", gate: "delivery_accepted" })], PLAN_GATE)).toBeNull();
    expect(decidedRecord([], PLAN_GATE)).toBeNull();
  });
});

describe("earlierSendBack", () => {
  it("is the last send-back a person made at the gate", () => {
    const records = [
      record({ id: "g1", message: "first" }),
      record({ id: "g2", outcome: "approve" }),
      record({ id: "g3", message: "second", actor: "sam@example.com" }),
      record({ id: "g4", source: "gate", outcome: "send_back" }),
    ];
    expect(earlierSendBack(records, PLAN_GATE)?.id).toBe("g3");
  });

  it("is null without one", () => {
    expect(earlierSendBack([record({ id: "g1", outcome: "approve" })], PLAN_GATE)).toBeNull();
  });
});
