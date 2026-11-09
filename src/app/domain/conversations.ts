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

/** What a pinned item's chip says: its key, its title when the page knows it, or a short form of a link. */
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
      return `Figma · ${name === undefined ? 'design' : decodeURIComponent(name).replaceAll('-', ' ')}`;
    }
    case 'repository':
      return `repo · ${item.ref}`;
  }
}

/** The question still waiting or being answered, if any (at most one is). */
export function openTurn<T extends TurnLike>(turns: readonly T[]): T | null {
  return (
    turns.find((t) => t.status === 'queued' || t.status === 'handed') ?? null
  );
}

/** Whether the page should read the conversation again soon: a question is open, or a session is still stopping. */
export function needsPolling(conversation: ConversationLike): boolean {
  return openTurn(conversation.turns) !== null;
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
