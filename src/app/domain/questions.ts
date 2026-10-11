/** What every screen agrees on about questions, whatever else it shows of them. */

/** The part of a question these rules read. */
export interface QuestionLike {
  readonly answer: string | null;
  readonly supersededAt: string | null;
}

/** Whether an intake refresh made the question history: it is shown, never answered, never counted as waiting. */
export function isSuperseded(question: QuestionLike): boolean {
  return question.supersededAt !== null;
}

/** The questions an intake refresh has not superseded, in the order given. */
export function currentQuestions<Q extends QuestionLike>(
  questions: readonly Q[]
): readonly Q[] {
  return questions.filter((question) => !isSuperseded(question));
}

/** The questions still waiting for an answer: unanswered and not superseded. */
export function openQuestions<Q extends QuestionLike>(
  questions: readonly Q[]
): readonly Q[] {
  return questions.filter(
    (question) => question.answer === null && !isSuperseded(question)
  );
}
