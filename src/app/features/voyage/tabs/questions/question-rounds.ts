import type { Question } from '@core/api/types';

/** The longest answer the API takes (`AnswerRequest.answer`: `maxLength: 20000`, counted in characters). */
export const ANSWER_MAX = 20000;

/** One round of questions, as the Questions tab groups and counts them. */
export interface QuestionRound {
  readonly round: number;
  /** The round's questions in the order the API lists them. */
  readonly questions: readonly Question[];
  /** How many of them have an answer. */
  readonly answered: number;
  /** 0 to 100, for the meter. */
  readonly percent: number;
}

/** Whether a question has its (final) answer. */
export function isAnswered(question: Question): boolean {
  return question.answer !== null;
}

/**
 * Groups the questions by `round`, the newest round first (the one a person has to deal with), counting how many are
 * answered. Questions keep the order the API gave them inside their round.
 */
export function groupRounds(
  questions: readonly Question[]
): readonly QuestionRound[] {
  const byRound = new Map<number, Question[]>();
  for (const question of questions) {
    const group = byRound.get(question.round);
    if (group === undefined) byRound.set(question.round, [question]);
    else group.push(question);
  }
  return [...byRound.entries()]
    .sort(([a], [b]) => b - a)
    .map(([round, group]) => {
      const answered = group.filter(isAnswered).length;
      return {
        round,
        questions: group,
        answered,
        percent: Math.round((answered / group.length) * 100),
      };
    });
}

/** The questions that still need an answer, in every round. */
export function unanswered(
  questions: readonly Question[]
): readonly Question[] {
  return questions.filter((question) => !isAnswered(question));
}

/** What is wrong with a typed answer, or `null` when it can be sent. It is judged trimmed, as it is sent. */
export function answerProblem(text: string): 'empty' | 'too_long' | null {
  const trimmed = text.trim();
  if (trimmed === '') return 'empty';
  return Array.from(trimmed).length > ANSWER_MAX ? 'too_long' : null;
}

/** The message under a card whose answer is too long. */
export function tooLongMessage(text: string): string {
  const length = Array.from(text.trim()).length;
  return `An answer can have at most ${ANSWER_MAX.toLocaleString('en-US')} characters; this one has ${length.toLocaleString('en-US')}.`;
}

/**
 * The toast after an answer was recorded: how many questions are left, or that the voyage is queued. `left` counts
 * every question still without an answer, in any round, once this one is answered.
 */
export function answerSentToast(
  questionId: string,
  left: number,
  crew: string
): string {
  if (left === 0)
    return `Answer to ${questionId} sent. All questions answered: ${crew} is queued.`;
  return `Answer to ${questionId} sent. ${left} ${left === 1 ? 'question' : 'questions'} left.`;
}
