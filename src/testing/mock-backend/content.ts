/**
 * The text the simulated crew writes: Jira snapshots, implementation plans, questions, progress steps and reports.
 * All of it is fictional (CLAUDE.md), deterministic, and derived from the story's key and title.
 */
import type { PlanContent } from './voyage';

/** A progress step a simulated run logs: a tool call or a message. */
export type ProgressStep =
  | { readonly kind: 'tool'; readonly tool: string; readonly summary?: string }
  | { readonly kind: 'message'; readonly text: string };

/** The Jira snapshot Navigator writes at intake. */
export function jiraSnapshot(key: string, title: string): string {
  return [
    `# ${key} ${title}`,
    '',
    '## Description',
    '',
    `${title}. Example ticket for the Ahoy mock backend; every name in it is fictional.`,
    '',
    '## Acceptance notes from the ticket',
    '',
    '- The change is visible to customers on the page the ticket names.',
    '- Existing behaviour stays as it is for everyone else.',
    '',
  ].join('\n');
}

/** The questions Cartographer asks on its first planning run. */
export function planningQuestions(title: string): readonly {
  readonly text: string;
  readonly recommendation: string | null;
}[] {
  return [
    {
      text: `Should "${title}" apply to every customer at once, or behind a feature flag first?`,
      recommendation:
        'Behind a feature flag first, switched on for everyone once support has seen it.',
    },
    {
      text: 'Which repositories may this voyage change: only the web front end, or the API as well?',
      recommendation: null,
    },
  ];
}

/** What the planner's state says about the plan it wrote. */
export function planContent(key: string): PlanContent {
  return {
    criteria: [
      {
        id: 'AC1',
        text: 'The change is visible on the page the ticket names.',
        repo: 'web',
        test_ids: [`${key.toLowerCase()}-visible`],
        verification_mode: 'test',
      },
      {
        id: 'AC2',
        text: 'Existing behaviour is unchanged for everyone else.',
        repo: 'api',
        test_ids: [`${key.toLowerCase()}-unchanged`],
        verification_mode: 'test',
      },
    ],
    packages: [
      { id: 'WP1', repo: 'api', agent: 'implementer', open_pr: true },
      {
        id: 'WP2',
        repo: 'web',
        agent: 'implementer',
        open_pr: true,
        depends_on: ['WP1'],
      },
    ],
    repos: ['api', 'web'],
  };
}

/** The implementation plan of a revision; a later round answers the reason of the send-back. */
export function implementationPlan(
  key: string,
  title: string,
  round: number,
  revisionReason: string | null
): string {
  const lines = [
    `# Implementation plan: ${key} ${title}`,
    '',
    '## Summary',
    '',
    `${title}, in two work packages: the API first, then the web front end.`,
    '',
    '## Acceptance criteria',
    '',
    '- AC1 The change is visible on the page the ticket names.',
    '- AC2 Existing behaviour is unchanged for everyone else.',
  ];
  if (round > 1)
    lines.push(
      `- AC${round + 1} Revision ${round} adds what the review asked for.`
    );
  lines.push(
    '',
    '## WP1 API',
    '',
    '- Add the field the page needs to the API response.',
    '- Cover it with a contract test.',
    '',
    '## WP2 Web',
    '',
    '- Show the new field on the page.',
    '- Add a component test for the empty and the filled state.',
    ''
  );
  if (revisionReason !== null)
    lines.push(
      '## Changes in this revision',
      '',
      `- Answers the review: ${revisionReason.replace(/\s+/g, ' ')}`,
      ''
    );
  return lines.join('\n');
}

/** The report Implementer leaves behind. */
export function implementationReport(key: string): string {
  return [
    `# Implementation report: ${key}`,
    '',
    '- WP1 api: pull request opened, checks green.',
    '- WP2 web: pull request opened, checks green.',
    '',
  ].join('\n');
}

/** The steps a run of a phase logs, in order (enough for the longest simulated run). */
export function progressSteps(
  phase: string,
  key: string
): readonly ProgressStep[] {
  const spec = `specs/${key}/jira-snapshot.md`;
  switch (phase) {
    case 'intake':
      return [
        { kind: 'message', text: 'Reading the ticket and its links.' },
        { kind: 'tool', tool: 'jira', summary: key },
        { kind: 'tool', tool: 'create', summary: spec },
        { kind: 'message', text: 'The snapshot is complete.' },
      ];
    case 'planning':
      return [
        {
          kind: 'message',
          text: 'Reading the Jira snapshot and the code it names.',
        },
        { kind: 'tool', tool: 'view', summary: spec },
        { kind: 'tool', tool: 'grep', summary: 'feature flag' },
        { kind: 'tool', tool: 'view', summary: 'api/src/routes.ts' },
        { kind: 'tool', tool: 'bash', summary: 'git log --oneline -5' },
        {
          kind: 'message',
          text: 'Drafting the acceptance criteria and the work packages.',
        },
        {
          kind: 'tool',
          tool: 'create',
          summary: `specs/${key}/implementation-plan.md`,
        },
        { kind: 'message', text: 'The plan is written.' },
      ];
    case 'implementation':
      return [
        { kind: 'message', text: 'Starting WP1 in the api repository.' },
        { kind: 'tool', tool: 'edit', summary: 'api/src/routes.ts' },
        { kind: 'tool', tool: 'bash', summary: 'npm test' },
        {
          kind: 'message',
          text: 'WP1 is done; starting WP2 in the web repository.',
        },
        { kind: 'tool', tool: 'edit', summary: 'web/src/page.component.ts' },
        { kind: 'tool', tool: 'bash', summary: 'npm test' },
        { kind: 'tool', tool: 'github', summary: 'open pull requests' },
        { kind: 'message', text: 'Both pull requests are open.' },
      ];
    default:
      return [
        { kind: 'message', text: 'Reading the pull requests.' },
        { kind: 'tool', tool: 'github', summary: 'list changed files' },
        { kind: 'tool', tool: 'view', summary: 'web/src/page.component.ts' },
        { kind: 'message', text: 'No blocking findings.' },
      ];
  }
}

/** The pre-refinement the simulated refinement agent replies with, in the sections the real prompt asks for. */
export function refinementMarkdown(key: string, notes: string | null): string {
  return [
    '## Verdict',
    `NEEDS WORK. A simulated pre-refinement of ${key}: the mock read no Jira and called no model.`,
    '',
    '## Summary',
    'The story asks for one visible change for customers; it names no failure case and no limit.',
    '',
    '## Proposed story',
    'As a billing administrator, I want the change the ticket describes, so that customers see correct invoices.',
    '',
    '## Acceptance criteria',
    '1. Given a customer on the page the ticket names, when it loads, then the change is visible. (from Jira)',
    '2. Given the data is missing, when the page loads, then it says so instead of showing a blank. (new)',
    '',
    '## Open questions',
    '1. Should the change apply to every customer at once, or behind a feature flag first?',
    '',
    '## Assumptions',
    '- Assumption: the service already stores the data the page needs.',
    '',
    '## Risks and dependencies',
    'None found (simulated).',
    '',
    '## Suggested split',
    'Not needed',
    '',
    '## Affected repositories',
    'From the issue only: no code was read (simulated).',
    ...(notes !== null ? ['', "## Requester's notes", notes] : []),
  ].join('\n');
}

/** The diagnosis the simulated diagnosing agent replies with, in the sections the real prompt asks for. */
export function agentDiagnosisMarkdown(
  key: string,
  haltReason: string | null,
  notes: string | null
): string {
  return [
    '## Cause',
    `A simulated diagnosis of ${key}: the mock read no evidence and called no model. The halt reason was ${haltReason ?? 'not recorded'}.`,
    '',
    '## Evidence',
    `- halt reason: ${haltReason ?? 'none'} (simulated)`,
    '',
    '## What fixes it',
    "Read the rules' findings above, apply the action they name, then resume the story (simulated).",
    '',
    '## Who acts',
    "The story's owner (simulated).",
    '',
    '## What is still unknown',
    'Everything an agent would have read in the control repository (simulated).',
    ...(notes !== null ? ['', "## Requester's notes", notes] : []),
  ].join('\n');
}
