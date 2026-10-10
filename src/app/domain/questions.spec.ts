import { currentQuestions, isSuperseded, openQuestions } from './questions';

const question = (answer: string | null, supersededAt: string | null) => ({
  answer,
  supersededAt,
});

describe('questions', () => {
  const answered = question('Both', null);
  const open = question(null, null);
  const oldAnswered = question('Electrical only', '2026-10-06T10:05:00Z');
  const oldOpen = question(null, '2026-10-06T10:05:00Z');
  const all = [answered, open, oldAnswered, oldOpen];

  it('calls a question superseded once an intake refresh set supersededAt', () => {
    expect(all.map(isSuperseded)).toEqual([false, false, true, true]);
  });

  it('keeps the questions a refresh has not superseded, in order', () => {
    expect(currentQuestions(all)).toEqual([answered, open]);
  });

  it('counts as open only an unanswered question that is not superseded', () => {
    expect(openQuestions(all)).toEqual([open]);
  });
});
