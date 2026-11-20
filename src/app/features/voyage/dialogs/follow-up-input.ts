import type { FollowUpIssueType, FollowUpRoute } from '@core/api/types';
import { parseAiu } from '@domain/aiu';

/** A Jira issue key; a follow-up key (`PROJ-1-FU1`) is Ahoy's, never a Jira issue. */
const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9]+-[0-9]+$/;

/** The limits of a follow-up brief, as the API takes it. */
export const BRIEF_TEXT_MAX = 8000;
export const CRITERIA_MAX = 30;
export const CRITERION_MAX = 1000;
export const TITLE_MAX = 500;

/** Where the follow-up comes from: an existing Jira issue, one Ahoy creates in Jira from the brief, or Ahoy only. */
export type FollowUpOrigin = 'jira' | 'create' | 'ahoy';

/** What the person typed into the start-follow-up form. */
export interface FollowUpInput {
  readonly source: FollowUpOrigin;
  readonly issueType: FollowUpIssueType;
  readonly jiraKey: string;
  readonly title: string;
  readonly text: string;
  readonly criteria: string;
  readonly route: FollowUpRoute;
  readonly repo: string;
  readonly budget: string;
}

/** The first problem of each field; a field that is fine is absent. */
export type FollowUpProblems = Partial<
  Record<'jiraKey' | 'title' | 'text' | 'criteria' | 'repo' | 'budget', string>
>;

/** The criteria typed one per line: trimmed, with the empty lines dropped. */
export function parseCriteria(text: string): readonly string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** What is wrong with the form, in words for the person; empty when it can be sent. */
export function checkFollowUp(input: FollowUpInput): FollowUpProblems {
  const problems: Record<string, string> = {};
  const ahoyOnly = input.source === 'ahoy';
  const creating = input.source === 'create';
  const needsBrief = ahoyOnly || creating;
  const text = input.text.trim();
  const criteria = parseCriteria(input.criteria);
  if (input.source === 'jira' && !JIRA_KEY_PATTERN.test(input.jiraKey.trim()))
    problems['jiraKey'] = 'Enter a Jira key like PROJ-123.';
  if (creating && input.title.trim() === '')
    problems['title'] = 'Give the Jira issue a title.';
  else if (input.title.trim().length > TITLE_MAX)
    problems['title'] = `At most ${TITLE_MAX} characters.`;
  if (needsBrief && text === '')
    problems['text'] = 'Say what is new or missing.';
  else if (text.length > BRIEF_TEXT_MAX)
    problems['text'] = `At most ${BRIEF_TEXT_MAX} characters.`;
  if (needsBrief && criteria.length === 0)
    problems['criteria'] = 'Add at least one acceptance criterion.';
  else if (criteria.length > CRITERIA_MAX)
    problems['criteria'] = `At most ${CRITERIA_MAX} criteria.`;
  else if (criteria.some((line) => line.length > CRITERION_MAX))
    problems['criteria'] =
      `Each criterion takes at most ${CRITERION_MAX} characters.`;
  if (input.route === 'fast_path' && input.repo === '')
    problems['repo'] = 'Pick the repository to change.';
  const budget = input.budget.trim() === '' ? null : parseAiu(input.budget);
  if (budget === null || budget < 1)
    problems['budget'] = 'Enter an amount in AIU, like 40 or 25.5.';
  return problems;
}
