import type { Question } from "@core/api/types";
import {
  ANSWER_MAX,
  answerProblem,
  answerSentToast,
  groupRounds,
  isAnswered,
  tooLongMessage,
  unanswered,
} from "./question-rounds";

function question(id: string, round: number, answer: string | null = null): Question {
  return {
    id,
    round,
    runId: "run-1",
    text: `Question ${id}?`,
    recommendation: null,
    answer,
    answeredBy: answer === null ? null : "alex@example.com",
    answeredAt: answer === null ? null : "2026-10-07T09:12:00Z",
    consumed: false,
  };
}

describe("groupRounds", () => {
  it("counts how many questions of a round are answered", () => {
    const [round] = groupRounds([question("Q1", 1, "Yes."), question("Q2", 1), question("Q3", 1)]);
    expect(round).toMatchObject({ round: 1, answered: 1, percent: 33 });
    expect(round?.questions.map((q) => q.id)).toEqual(["Q1", "Q2", "Q3"]);
  });

  it("puts the newest round first and keeps the API's order inside each round", () => {
    const rounds = groupRounds([question("Q1", 1, "A"), question("Q2", 1, "B"), question("Q3", 2), question("Q4", 2)]);
    expect(rounds.map((r) => r.round)).toEqual([2, 1]);
    expect(rounds[0]?.questions.map((q) => q.id)).toEqual(["Q3", "Q4"]);
    expect(rounds[1]?.questions.map((q) => q.id)).toEqual(["Q1", "Q2"]);
  });

  it("counts a fully answered round at 100 %", () => {
    const [round] = groupRounds([question("Q1", 1, "A"), question("Q2", 1, "B")]);
    expect(round).toMatchObject({ answered: 2, percent: 100 });
  });

  it("gives no rounds for no questions", () => {
    expect(groupRounds([])).toEqual([]);
  });
});

describe("unanswered", () => {
  it("lists the questions without an answer, in every round", () => {
    const list = [question("Q1", 1, "A"), question("Q2", 1), question("Q3", 2)];
    expect(unanswered(list).map((q) => q.id)).toEqual(["Q2", "Q3"]);
    expect(isAnswered(question("Q1", 1, "A"))).toBe(true);
  });
});

describe("answerProblem", () => {
  it("refuses an empty or blank answer", () => {
    expect(answerProblem("")).toBe("empty");
    expect(answerProblem("   \n ")).toBe("empty");
  });

  it("takes 1 to 20 000 characters, judged after trimming", () => {
    expect(answerProblem("a")).toBeNull();
    expect(answerProblem("a".repeat(ANSWER_MAX))).toBeNull();
    expect(answerProblem(`  ${"a".repeat(ANSWER_MAX)}  `)).toBeNull();
    expect(answerProblem("a".repeat(ANSWER_MAX + 1))).toBe("too_long");
  });

  it("counts characters, not UTF-16 units, as the contract does", () => {
    expect(answerProblem("🚢".repeat(ANSWER_MAX))).toBeNull();
    expect(answerProblem("🚢".repeat(ANSWER_MAX + 1))).toBe("too_long");
  });

  it("says how long an answer that is too long is", () => {
    expect(tooLongMessage("a".repeat(20001))).toBe(
      "An answer can have at most 20,000 characters; this one has 20,001.",
    );
  });
});

describe("answerSentToast", () => {
  it("says how many questions are left", () => {
    expect(answerSentToast("Q2", 1, "Cartographer")).toBe("Answer to Q2 sent. 1 question left.");
    expect(answerSentToast("Q2", 2, "Cartographer")).toBe("Answer to Q2 sent. 2 questions left.");
  });

  it("says the crew member is queued when nothing is left", () => {
    expect(answerSentToast("Q3", 0, "Cartographer")).toBe(
      "Answer to Q3 sent. All questions answered: Cartographer is queued.",
    );
  });
});
