/**
 * Team settings › Agents in words: the four jobs, which of them spend AIU outside a story's budget once on, the check
 * of the knowledge repository, and what one entry of the agents' history says. Pure.
 */

/** A job whose profile is a setting, as the API names it. */
export type AgentJobKey =
  'refinementAgent' | 'diagnosisAgent' | 'storyDraftAgent' | 'knowledgeAgent';

/** Who runs each job; a null profile turns the job off. */
export interface AgentJobChoice {
  readonly refinementAgent: string;
  readonly diagnosisAgent: string;
  readonly storyDraftAgent: string | null;
  readonly knowledgeAgent: string | null;
}

/** One job in words, for the page. */
export interface AgentJobWords {
  readonly key: AgentJobKey;
  readonly name: string;
  /** When it runs. */
  readonly when: string;
  /** When it spends AIU. */
  readonly spends: string;
  /** Whether it can be off: the two jobs that spend AIU outside a story's budget. */
  readonly optional: boolean;
}

/** The jobs, in the order the page lists them. */
export const AGENT_JOB_WORDS: readonly AgentJobWords[] = [
  {
    key: 'refinementAgent',
    name: 'Pre-refinement',
    when: 'When someone asks Ahoy to refine a backlog item',
    spends: 'Each time someone asks, after they confirm',
    optional: false,
  },
  {
    key: 'diagnosisAgent',
    name: 'Halt diagnosis',
    when: 'When a story halts and someone asks why',
    spends: 'Each time someone asks, after they confirm',
    optional: false,
  },
  {
    key: 'storyDraftAgent',
    name: 'Story drafts',
    when: 'When someone drafts a story from a meeting topic',
    spends: 'Each draft, when on',
    optional: true,
  },
  {
    key: 'knowledgeAgent',
    name: 'Business-rule review',
    when: 'After each story that reaches done',
    spends: 'After every finished story, when on',
    optional: true,
  },
];

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** The jobs a change turns on from off: saving them asks the admin to confirm the AIU they will spend. */
export function jobsTurnedOn(
  before: AgentJobChoice,
  after: AgentJobChoice
): AgentJobWords[] {
  return AGENT_JOB_WORDS.filter(
    (job) => job.optional && before[job.key] === null && after[job.key] !== null
  );
}

/** What turning jobs on will spend, in one sentence per job, for the warning and the confirmation. */
export function spendWarning(job: AgentJobWords): string {
  return job.key === 'knowledgeAgent'
    ? 'A review run starts by itself each time a story reaches done, and spends AIU outside that story’s budget.'
    : 'Anyone can then draft a story from a meeting topic; each draft is a run that spends AIU outside any story’s budget.';
}

/** "2 of 4 on": how many jobs run, for the side navigation. */
export function jobsOnLabel(jobs: AgentJobChoice): string {
  const on = AGENT_JOB_WORDS.filter((job) => jobs[job.key] !== null).length;
  return `${on} of ${AGENT_JOB_WORDS.length} on`;
}

/** Why a typed knowledge repository would be refused, or null when it is fine (empty clears it). */
export function knowledgeRepoProblem(typed: string): string | null {
  const repo = typed.trim();
  if (repo === '') return null;
  if (
    repo.length > 200 ||
    !REPOSITORY.test(repo) ||
    repo.split('/').some((part) => part === '.' || part === '..')
  )
    return 'Give it as owner/name, such as acme/business-rules.';
  return null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A profile in words: its name, or "off". */
function profileWords(value: unknown): string {
  return typeof value === 'string' && value !== '' ? value : 'off';
}

const FIELD_NAMES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(AGENT_JOB_WORDS.map((job) => [job.key, job.name])),
  knowledgeRepo: 'Knowledge repository',
};

/** What one Agents entry of the settings history says happened, or undefined for an entry of another section. */
export function describeAgentEvent(
  type: string,
  payload: unknown
): string | undefined {
  if (type !== 'agent_settings.updated') return undefined;
  const p = isRecord(payload) ? payload : {};
  const changes = p['changes'];
  const words = isRecord(changes)
    ? Object.entries(changes).flatMap(([field, change]) => {
        if (!isRecord(change)) return [];
        const name = FIELD_NAMES[field] ?? field;
        const from =
          field === 'knowledgeRepo'
            ? profileWords(change['from']).replace(/^off$/, 'none')
            : profileWords(change['from']);
        const to =
          field === 'knowledgeRepo'
            ? profileWords(change['to']).replace(/^off$/, 'none')
            : profileWords(change['to']);
        return [`${name}: ${from} → ${to}`];
      })
    : [];
  const text = words.length === 0 ? 'Saved the agents’ jobs' : words.join('; ');
  return p['confirmSpend'] === true
    ? `${text} (confirmed it spends AIU)`
    : text;
}
