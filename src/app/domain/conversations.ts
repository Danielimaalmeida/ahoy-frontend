/**
 * Pure rules for the Product page's conversations: the words for recipes, pinned items and turn states, what may be
 * pinned, whether the person may ask now, and what the session panel says. The shapes below are the parts of the
 * contract's `Conversation` these rules read (`domain/` may not import `core/`); a real value always fits them.
 */

/** What a conversation is for (`ConversationRecipe`). */
export type ConversationRecipe = 'split-epic' | 'story-ready' | 'how-today';

/** What may be pinned for the agent to read (`ConversationContextKind`). */
export type ConversationContextKind =
  'jira' | 'meeting_topic' | 'defect' | 'figma' | 'repository';

/** Where a question is (`ConversationTurn.status`). */
export type ConversationTurnStatus =
  'queued' | 'handed' | 'answered' | 'failed' | 'cancelled';

/** A pinned item. */
export interface ContextItemLike {
  readonly kind: ConversationContextKind;
  readonly ref: string;
  readonly label: string | null;
}

/** A question of a conversation, as far as these rules read it. */
export interface TurnLike {
  readonly n: number;
  readonly status: ConversationTurnStatus;
}

/** A conversation, as far as these rules read it. */
export interface ConversationLike {
  readonly canAsk: boolean;
  readonly turns: readonly TurnLike[];
  readonly session: {
    readonly status: 'queued' | 'running';
    readonly cancelRequested: boolean;
  } | null;
}

/** A conversation as the list shows it, as far as these rules read it. */
export interface ConversationSummaryLike {
  readonly key: string;
  readonly owner: string;
  readonly ownerName: string | null;
  readonly turnCount: number;
  readonly updatedAt: string;
}

/** How often an open conversation is read again while one of its questions waits or is being answered. */
export const CONVERSATION_POLL_MS = 1_000;

/** How often it is read again while its session is only warm, so the page sees the session end. */
export const WARM_POLL_MS = 15_000;

/** The longest title the API takes. */
export const CONVERSATION_TITLE_MAX = 200;
/** The longest question the API takes. */
export const CONVERSATION_QUESTION_MAX = 4_000;
/** The most questions one conversation takes. */
export const CONVERSATION_TURNS_MAX = 40;
/** The most items pinned to one conversation, of which at most three repositories and three Figma links. */
export const CONTEXT_ITEMS_MAX = 12;
export const CONTEXT_REPOSITORIES_MAX = 3;
export const CONTEXT_FIGMA_MAX = 3;
/** The highest cap one question's session may have (20 AIU), in nano-AIU. */
export const CONVERSATION_BUDGET_MAX_NANO_AIU = 20_000_000_000;
/** How long a session stays warm for the next question, in minutes (the server's idle time). */
export const WARM_MINUTES = 10;

/** How the page names a recipe, says what it does, and titles a conversation started from it. */
export interface RecipeWords {
  readonly label: string;
  readonly hint: string;
  readonly title: string;
  /** The first question it suggests. */
  readonly question: string;
}

export const RECIPE_WORDS: Readonly<Record<ConversationRecipe, RecipeWords>> = {
  'split-epic': {
    label: 'Split an epic into stories',
    hint: 'Pin the epic; the agent proposes stories in delivery order, with the risks it sees.',
    title: 'Split an epic',
    question:
      'Split the pinned epic into stories, in the order they should be delivered.',
  },
  'story-ready': {
    label: 'Is this story ready?',
    hint: 'Pin a story; the agent checks it for refinement and asks what only you can settle.',
    title: 'Is it ready?',
    question: 'Is the pinned story ready for refinement? What is missing?',
  },
  'how-today': {
    label: 'How does it work today?',
    hint: 'Pin up to three repositories; the agent reads the code and explains, citing files.',
    title: 'How it works today',
    question: 'How does this work today, from the pinned repositories?',
  },
};

/** How the page names each kind of pinned context, and what its field asks for. */
export interface ContextKindWords {
  readonly label: string;
  readonly placeholder: string;
}

export const CONTEXT_KIND_WORDS: Readonly<
  Record<ConversationContextKind, ContextKindWords>
> = {
  jira: { label: 'Jira issue or epic', placeholder: 'PROJ-123' },
  meeting_topic: { label: 'Meeting topic', placeholder: 'Search topics' },
  defect: { label: 'Defect', placeholder: 'PROJ-456' },
  figma: {
    label: 'Figma link',
    placeholder: 'https://www.figma.com/design/…',
  },
  repository: { label: 'Repository', placeholder: 'web' },
};

/** What a turn's status reads as. */
export const TURN_STATUS_WORDS: Readonly<
  Record<ConversationTurnStatus, string>
> = {
  queued: 'Waiting for the agent',
  handed: 'Answering',
  answered: 'Answered',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** A Jira key, as the API takes it. */
const JIRA_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
/** A figma.com design, file or prototype link. */
const FIGMA_LINK =
  /^https?:\/\/(?:www\.)?figma\.com\/(?:design|file|proto)\/[A-Za-z0-9]+(?:\/\S*)?$/;
/** A repository alias of the content repository. */
const REPOSITORY_ALIAS = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** A pinned item as typed, or what is wrong with it. */
export type PinInput =
  | { readonly ok: true; readonly ref: string }
  | { readonly ok: false; readonly message: string };

/**
 * Reads what the person typed to pin one item of `kind`. The API checks it again (that the defect or repository
 * exists); this only says early what it would refuse. A meeting topic is picked from a search, never typed.
 */
export function pinInput(
  kind: ConversationContextKind,
  text: string
): PinInput {
  const value = text.trim();
  if (value === '') return { ok: false, message: 'Type what to pin.' };
  switch (kind) {
    case 'jira':
    case 'defect': {
      const key = value.toUpperCase();
      return JIRA_KEY.test(key)
        ? { ok: true, ref: key }
        : { ok: false, message: 'A Jira key, such as PROJ-123.' };
    }
    case 'figma':
      return value.length <= 2000 && FIGMA_LINK.test(value)
        ? { ok: true, ref: value }
        : {
            ok: false,
            message: 'A figma.com design, file or prototype link.',
          };
    case 'repository':
      return REPOSITORY_ALIAS.test(value)
        ? { ok: true, ref: value }
        : {
            ok: false,
            message:
              'The repository’s name in the content repository, such as web.',
          };
    case 'meeting_topic':
      return { ok: false, message: 'Pick a topic from the search.' };
  }
}

/** One way to pin what was typed in the quick box: as a kind, under a ref the API takes. */
export interface QuickPin {
  readonly kind: ConversationContextKind;
  readonly ref: string;
}

/**
 * The ways to pin what was pasted in the quick box, the likeliest first (Enter takes it): a Jira key as an issue or
 * a defect, a Figma link, or a repository alias. A lower-case key such as `web-2` may be either a key or a repository.
 * Nothing when it is none of them; a meeting topic is picked from the search of the full dialog.
 */
export function quickPins(text: string): readonly QuickPin[] {
  const value = text.trim();
  if (value === '') return [];
  if (value.length <= 2000 && FIGMA_LINK.test(value))
    return [{ kind: 'figma', ref: value }];
  const key = value.toUpperCase();
  const asKey: readonly QuickPin[] = JIRA_KEY.test(key)
    ? [
        { kind: 'jira', ref: key },
        { kind: 'defect', ref: key },
      ]
    : [];
  const asRepository: readonly QuickPin[] =
    REPOSITORY_ALIAS.test(value) && (asKey.length === 0 || value !== key)
      ? [{ kind: 'repository', ref: value }]
      : [];
  return [...asKey, ...asRepository];
}

/** Why one more item of `kind` cannot be pinned next to `pinned`, or null when it can. */
export function pinRefusal(
  pinned: readonly ContextItemLike[],
  kind: ConversationContextKind,
  ref: string
): string | null {
  if (pinned.some((p) => p.kind === kind && p.ref === ref))
    return 'It is pinned already.';
  if (pinned.length >= CONTEXT_ITEMS_MAX)
    return `At most ${CONTEXT_ITEMS_MAX} items can be pinned.`;
  const same = pinned.filter((p) => p.kind === kind).length;
  if (kind === 'repository' && same >= CONTEXT_REPOSITORIES_MAX)
    return `At most ${CONTEXT_REPOSITORIES_MAX} repositories can be pinned.`;
  if (kind === 'figma' && same >= CONTEXT_FIGMA_MAX)
    return `At most ${CONTEXT_FIGMA_MAX} Figma links can be pinned.`;
  return null;
}

/** What a pinned item's chip says after its kind: its key, its title when the page knows it, or a link's file name. */
export function contextChipText(item: ContextItemLike): string {
  switch (item.kind) {
    case 'jira':
      return item.ref;
    case 'defect':
      return item.label === null ? item.ref : `${item.ref} · ${item.label}`;
    case 'meeting_topic':
      return item.label ?? 'Meeting topic';
    case 'figma': {
      const name =
        /figma\.com\/(?:design|file|proto)\/[A-Za-z0-9]+\/([^/?#]+)/.exec(
          item.ref
        )?.[1];
      return name === undefined
        ? 'design'
        : decodeURIComponent(name).replaceAll('-', ' ');
    }
    case 'repository':
      return item.ref;
  }
}

/** The question still waiting or being answered, if any (at most one is). */
export function openTurn<T extends TurnLike>(turns: readonly T[]): T | null {
  return (
    turns.find((t) => t.status === 'queued' || t.status === 'handed') ?? null
  );
}

/**
 * How soon the page reads the conversation again when it cannot follow its stream: every second while a question is
 * open, less often while its session is warm or stopping (so "warm" is never shown after the session ended), and never
 * (null) once neither is true.
 */
export function pollDelay(conversation: ConversationLike): number | null {
  if (openTurn(conversation.turns) !== null) return CONVERSATION_POLL_MS;
  return conversation.session === null ? null : WARM_POLL_MS;
}

/** Why the person cannot ask now, or null when they can. */
export function askRefusal(conversation: ConversationLike): string | null {
  if (!conversation.canAsk)
    return 'Only the person who started this conversation can ask in it.';
  if (openTurn(conversation.turns) !== null)
    return 'The agent is still answering. Wait, or cancel the question.';
  if (conversation.turns.length >= CONVERSATION_TURNS_MAX)
    return `This conversation has its ${CONVERSATION_TURNS_MAX} questions. Start a new one.`;
  return null;
}

/** What the session panel says about the agent's session. */
export function sessionLine(conversation: ConversationLike): string {
  const session = conversation.session;
  if (session === null)
    return conversation.turns.length === 0
      ? 'No session yet. The first question starts one.'
      : `No session running. The next question starts one, which reads everything again.`;
  if (session.cancelRequested) return 'Stopping…';
  if (session.status === 'queued') return 'Starting a session…';
  return openTurn(conversation.turns) !== null
    ? 'Answering'
    : `Warm: the next question is answered right away. It ends after ${WARM_MINUTES} quiet minutes.`;
}

/** The left column's line under a conversation's title; `mine` leaves out whose it is. */
export function conversationSub(
  c: ConversationSummaryLike,
  mine: boolean
): string {
  const questions =
    c.turnCount === 0
      ? 'no questions'
      : c.turnCount === 1
        ? '1 question'
        : `${c.turnCount} questions`;
  return [c.key, questions, mine ? null : (c.ownerName ?? c.owner)]
    .filter((p) => p !== null)
    .join(' · ');
}

/** The person's own conversations and those others shared, each the latest changed first. */
export function conversationGroups<C extends ConversationSummaryLike>(
  items: readonly C[],
  isMine: (owner: string) => boolean
): {
  readonly mine: readonly C[];
  readonly shared: readonly C[];
} {
  const latest = [...items].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  );
  return {
    mine: latest.filter((c) => isMine(c.owner)),
    shared: latest.filter((c) => !isMine(c.owner)),
  };
}

/** Whether `text` is a Jira project key, such as PROJ (letters, digits and _, a letter first), in any case. */
export function isJiraProjectKey(text: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(text.trim());
}

/** The Jira project offered first for a story proposal: the project of the first pinned Jira issue, else of a defect. */
export function defaultJiraProject(
  context: readonly { readonly kind: string; readonly ref: string }[]
): string {
  const projectOf = (kind: string) => {
    for (const item of context) {
      const match = /^([A-Z][A-Z0-9_]*)-\d+$/.exec(item.ref);
      if (item.kind === kind && match?.[1] !== undefined) return match[1];
    }
    return '';
  };
  return projectOf('jira') || projectOf('defect');
}

/** What the agent may look up beyond the pins, by its MCP server: each turned on or off per conversation. */
export const LOOK_UPS = ['jira', 'confluence'] as const;
export type LookUp = (typeof LOOK_UPS)[number];

/** How the page names each look-up. */
export const LOOK_UP_WORDS: Readonly<Record<LookUp, string>> = {
  jira: 'Jira',
  confluence: 'Confluence',
};

/** A look-up as a conversation has it: turned on by the person, and set up on the server at all. */
export interface LookUpState {
  readonly on: boolean;
  readonly available: boolean;
}

/** The words of a list: "Jira", "Jira and Confluence". */
function and(words: readonly string[]): string {
  return words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/**
 * What the "Can look up" row says under its chips: whether anything is set up, what is off and what the agent reads
 * then, and that a change starts a new session (a warm one is stopped).
 */
export function lookUpNote(
  lookUp: Readonly<Record<LookUp, LookUpState>>,
  warm: boolean
): string {
  const available = LOOK_UPS.filter((l) => lookUp[l].available);
  if (available.length === 0)
    return 'Not set up: an admin gives the Product agent the Jira and Confluence tools (Team settings and the content repository). Until then it reads only what is pinned.';
  const missing = LOOK_UPS.filter((l) => !lookUp[l].available).map(
    (l) => LOOK_UP_WORDS[l]
  );
  const notSetUp =
    missing.length === 0 ? '' : ` ${and(missing)} is not set up.`;
  const off = available.filter((l) => !lookUp[l].on);
  const on = available.filter((l) => lookUp[l].on).map((l) => LOOK_UP_WORDS[l]);
  const change = warm
    ? ' Changing it ends the warm session: the next question starts a new one.'
    : ' It applies from the next question.';
  if (off.length === 0)
    return `The agent searches ${and(on)} beyond what is pinned. Turn ${on.length > 1 ? 'one' : 'it'} off to keep it to the pins.${warm ? change : ''}${notSetUp}`;
  const reads =
    on.length === 0 ? 'the pinned items' : `the pinned items and ${and(on)}`;
  return `${and(off.map((l) => LOOK_UP_WORDS[l]))} ${off.length > 1 ? 'are' : 'is'} off for this conversation: the agent reads only ${reads}.${change}${notSetUp}`;
}
