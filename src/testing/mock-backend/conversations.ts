/**
 * The mock's Product page conversations (`/conversations`): each person's own, and those shared with the team
 * (read-only to them). A question starts a pretend session (or goes to the warm one), which reads, streams its answer
 * in a few steps (sent on `GET /conversations/{id}/stream`), hands in proposals as the recipe suggests, and stays warm
 * until it is idle. Fictional text, 0 AIU of anything real.
 */
import type {
  Conversation,
  ConversationChange,
  ConversationContextChange,
  ConversationContextItem,
  ConversationModel,
  ConversationProposal,
  ConversationSummary,
  ConversationTurn,
  ConversationTurnRequest,
  GrillQuestion,
  NewConversation,
  ProposalIssueRequest,
  ProposalTopicRequest,
} from '@core/api/types';
import { iso, type Cancel, type MockClock } from './clock';
import { MockProblem, type MockStream } from './http';
import type { Writable } from './voyage';

/** How often an open conversation stream looks for a change, as `conversationStreamPollMs` in `ahoy-hosted`. */
export const CONVERSATION_STREAM_POLL_MS = 750;

const KNOWN_NAMES: ReadonlyMap<string, string> = new Map([
  ['alex@example.com', 'Alex Example'],
  ['dev@example.com', 'Dev Example'],
  ['sam@example.com', 'Sam Example'],
]);

/** The repositories the pretend content repository maps. */
export const MOCK_REPOSITORIES: readonly string[] = ['web', 'api', 'docs'];
/** The cap a session gets when the question names none (3 AIU), as the server's `product_conversation` configuration. */
export const DEFAULT_SESSION_BUDGET = 3_000_000_000;
/** How long the pretend session takes to start, between two streamed steps, and how long it stays warm. */
export const MOCK_START_MS = 1_500;
export const MOCK_STEP_MS = 700;
export const MOCK_WARM_MS = 600_000;
/** What each streamed step spends. */
const STEP_NANO_AIU = 150_000_000;

/** The mock team's model for Product conversations (Team settings › Phases). */
const TEAM_MODEL: ConversationModel = {
  model: 'claude-sonnet-5',
  reasoningEffort: null,
};

const JIRA_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const ISSUE_KEYS = /\b[A-Z][A-Z0-9_]{0,49}-[1-9]\d{0,9}\b/g;
const PROJECT_NUMBERS = /(?:^|[^\w#&])#([1-9]\d{0,9})\b/g;

/** What a question names that the mock "reads" with it: issue keys and `#n` of the conversation's project, not pinned. */
function mentionsOf(
  question: string,
  c: { context: readonly ConversationContextItem[]; jiraProject: string | null }
): ConversationTurn['mentions'] {
  const keys = [...question.matchAll(ISSUE_KEYS)].map((m) => m[0]);
  if (c.jiraProject !== null)
    for (const m of question.matchAll(PROJECT_NUMBERS))
      keys.push(`${c.jiraProject}-${m[1] ?? ''}`);
  return [...new Set(keys)]
    .filter((key) => !c.context.some((p) => p.kind === 'jira' && p.ref === key))
    .slice(0, 10)
    .map((ref) => ({
      kind: 'jira' as const,
      ref,
      label: `Simulated ${ref}`,
      problem: null,
    }));
}
const FIGMA_LINK =
  /^https?:\/\/(?:www\.)?figma\.com\/(?:design|file|proto)\/[A-Za-z0-9]+(?:\/\S*)?$/;

type TurnRecord = Writable<ConversationTurn>;
interface SessionRecord {
  id: string;
  status: 'queued' | 'running';
  budgetNanoAiu: number;
  spentNanoAiu: number;
  cancelRequested: boolean;
  startedAt: string | null;
  /** The model it runs on, from when it starts. */
  model: string | null;
}
interface ConversationRecord {
  id: string;
  key: string;
  title: string;
  recipe: Conversation['recipe'];
  owner: string;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
  context: ConversationContextItem[];
  /** Whether the person lets the agent look up Jira and Confluence beyond the pins. */
  lookUp: { jira: boolean; confluence: boolean };
  /** The model and effort its owner chose; null is the team's. */
  model: ConversationModel;
  /** Where the agent looks first, copied from the team's defaults when it was started. */
  jiraProject: string | null;
  confluenceSpaces: string[];
  turns: TurnRecord[];
  session: SessionRecord | null;
  /** What the sessions that ended spent. */
  spentBefore: number;
  /** The pending timer of the pretend session, if any. */
  timer: Cancel | null;
}

const notFound = (id: string) =>
  new MockProblem(
    'not_found',
    `No conversation ${id}, or it is not shared with you`
  );
const invalid = (message: string) => new MockProblem('invalid_state', message);
const refused = (path: string, message: string) =>
  new MockProblem('validation_failed', message, {
    errors: [{ path, message }],
  });

/** The conversations of a mock world. */
/** An open `GET /conversations/{id}/stream`. */
interface OpenStream {
  /** Ends it normally. */
  close(): void;
  /** Ends it with an error, as a dropped connection would. */
  fail(reason: unknown): void;
}

export class ConversationDesk {
  private readonly conversations = new Map<string, ConversationRecord>();
  private nextId = 1;
  private nextKey = 1;
  private nextSession = 1;
  private readonly streams = new Set<OpenStream>();

  private nextIssue = 40;

  /** Team settings › Product: what every conversation started from now on begins with. */
  productDefaults: Conversation['teamDefaults'] = {
    jiraProject: null,
    confluenceSpaces: [],
    repositories: [],
  };

  constructor(
    private readonly clock: MockClock,
    /** An open meeting topic's title, or null when there is none with this id. */
    private readonly topicTitle: (id: string) => string | null,
    /** Adds a topic with one note to a planned or running meeting; throws as the meetings do when it cannot. */
    private readonly addMeetingTopic: (
      actor: string,
      meetingId: string,
      title: string,
      note: string
    ) => { topicId: string; meetingTitle: string } = () => {
      throw invalid('This mock has no meetings');
    }
  ) {}

  private id(): string {
    return `00000000-0000-4000-9000-${(this.nextId++).toString(16).padStart(12, '0')}`;
  }

  private now(): string {
    return iso(this.clock.now());
  }

  /** One conversation Sam shared with the team: how dunning works today, answered from a repository. */
  seed(at: number): void {
    const sam = 'sam@example.com';
    const c = this.insert(
      sam,
      'How does dunning work today?',
      'how-today',
      iso(at - 86_400_000)
    );
    c.shared = true;
    c.context.push({ kind: 'repository', ref: 'api', label: null });
    c.turns.push({
      n: 1,
      question: 'How are overdue invoices chased today?',
      askedBy: sam,
      askedByName: KNOWN_NAMES.get(sam) ?? null,
      askedAt: iso(at - 86_300_000),
      status: 'answered',
      liveText: null,
      activity: [],
      mentions: [],
      answer:
        'Today `api/src/billing/dunning.ts` sends **three reminders**, 7, 14 and 30 days after the due date, and stops when the invoice is paid. Nothing is charged for being late.',
      proposals: [],
      questions: [],
      error: null,
      endedAt: iso(at - 86_200_000),
    });
    c.spentBefore = 900_000_000;
    c.updatedAt = iso(at - 86_200_000);
  }

  /** The person's own conversations and those shared with the team. */
  list(actor: string): ConversationSummary[] {
    return [...this.conversations.values()]
      .filter((c) => c.owner === actor || c.shared)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => this.summary(c));
  }

  create(actor: string, body: NewConversation): Conversation {
    const title = body.title.trim().replaceAll(/\s+/g, ' ');
    if (title === '') throw refused('body/title', 'title is empty');
    return this.dto(
      this.insert(actor, title, body.recipe ?? null, this.now()),
      actor
    );
  }

  get(actor: string, id: string): Conversation {
    return this.dto(this.visible(actor, id), actor);
  }

  update(actor: string, id: string, body: ConversationChange): Conversation {
    const c = this.own(actor, id);
    const lookUp = { ...c.lookUp, ...body.lookUp };
    const lookUpChanged =
      lookUp.jira !== c.lookUp.jira ||
      lookUp.confluence !== c.lookUp.confluence;
    const model: ConversationModel = {
      model: body.model !== undefined ? body.model : c.model.model,
      reasoningEffort:
        body.reasoningEffort !== undefined
          ? body.reasoningEffort
          : c.model.reasoningEffort,
    };
    const modelChanged =
      model.model !== c.model.model ||
      model.reasoningEffort !== c.model.reasoningEffort;
    const jiraProject =
      body.jiraProject !== undefined
        ? (body.jiraProject?.trim().toUpperCase() ?? null)
        : c.jiraProject;
    const confluenceSpaces = body.confluenceSpaces ?? c.confluenceSpaces;
    const whereChanged =
      jiraProject !== c.jiraProject ||
      confluenceSpaces.join() !== c.confluenceSpaces.join();
    if (
      (lookUpChanged || modelChanged || whereChanged) &&
      this.openTurn(c) !== undefined
    )
      throw invalid(
        `A question is being answered: change ${lookUpChanged ? 'what it looks up' : modelChanged ? 'its model' : 'where it looks'} once it is answered`
      );
    if (body.title !== undefined) {
      const title = body.title.trim().replaceAll(/\s+/g, ' ');
      if (title === '') throw refused('body/title', 'title is empty');
      c.title = title;
    }
    if (body.shared !== undefined) c.shared = body.shared;
    if (lookUpChanged || modelChanged || whereChanged) {
      c.lookUp = lookUp;
      c.model = model;
      c.jiraProject = jiraProject;
      c.confluenceSpaces = [...confluenceSpaces];
      // A warm session was given the old look-ups or model: the next question starts a new one.
      this.endSession(c);
    }
    c.updatedAt = this.now();
    return this.dto(c, actor);
  }

  remove(actor: string, id: string): void {
    const c = this.own(actor, id);
    c.timer?.();
    this.conversations.delete(c.id);
  }

  setContext(
    actor: string,
    id: string,
    body: ConversationContextChange
  ): Conversation {
    const c = this.own(actor, id);
    if (this.openTurn(c) !== undefined)
      throw invalid(
        'A question is still being answered: cancel it or wait before you change what is pinned'
      );
    const items: ConversationContextItem[] = [];
    body.items.forEach((item, i) => {
      const at = `body/items/${i}/ref`;
      const ref = item.ref.trim();
      if (items.some((x) => x.kind === item.kind && x.ref === ref))
        throw refused(at, `${ref} is pinned twice`);
      switch (item.kind) {
        case 'jira':
          if (!JIRA_KEY.test(ref))
            throw refused(at, `${ref} is not a Jira key, such as PROJ-123`);
          items.push({ kind: 'jira', ref, label: null });
          break;
        case 'defect':
          if (!JIRA_KEY.test(ref))
            throw refused(at, `There is no defect ${ref}`);
          items.push({
            kind: 'defect',
            ref,
            label: 'Late fee shown twice on the PDF',
          });
          break;
        case 'meeting_topic': {
          const title = this.topicTitle(ref);
          if (title === null)
            throw refused(at, `There is no open meeting topic ${ref}`);
          items.push({ kind: 'meeting_topic', ref, label: title });
          break;
        }
        case 'figma':
          if (!FIGMA_LINK.test(ref))
            throw refused(at, 'Not a figma.com design, file or prototype link');
          items.push({ kind: 'figma', ref, label: null });
          break;
        case 'repository':
          if (!MOCK_REPOSITORIES.includes(ref))
            throw refused(
              at,
              `The content repository maps no repository ${ref}`
            );
          items.push({ kind: 'repository', ref, label: null });
          break;
      }
    });
    if (items.filter((x) => x.kind === 'repository').length > 3)
      throw refused('body/items', 'Pin at most 3 repositories');
    if (items.filter((x) => x.kind === 'figma').length > 3)
      throw refused('body/items', 'Pin at most 3 Figma links');
    c.context = items;
    // What the agent reads changed: a warm session stops, and the next question starts one that reads it all.
    this.endSession(c);
    c.updatedAt = this.now();
    return this.dto(c, actor);
  }

  ask(actor: string, id: string, body: ConversationTurnRequest): Conversation {
    const c = this.visible(actor, id);
    if (c.owner !== actor)
      throw new MockProblem(
        'forbidden',
        "Only the conversation's owner can ask in it"
      );
    if (this.openTurn(c) !== undefined)
      throw invalid(
        'The last question is still being answered: wait for it, or cancel it'
      );
    if (c.turns.length >= 40)
      throw invalid('This conversation has its 40 questions: start a new one');
    const n = c.turns.length + 1;
    c.turns.push({
      n,
      question: body.question.trim(),
      askedBy: actor,
      askedByName: KNOWN_NAMES.get(actor) ?? null,
      askedAt: this.now(),
      status: 'queued',
      liveText: null,
      activity: [],
      answer: null,
      proposals: [],
      questions: [],
      error: null,
      endedAt: null,
      mentions: mentionsOf(body.question, c),
    });
    c.updatedAt = this.now();
    if (c.session === null) {
      c.session = {
        id: `r-conv-${this.nextSession++}`,
        status: 'queued',
        budgetNanoAiu: body.budgetNanoAiu ?? DEFAULT_SESSION_BUDGET,
        spentNanoAiu: 0,
        cancelRequested: false,
        startedAt: null,
        model: null,
      };
      this.after(c, MOCK_START_MS, () => {
        if (c.session === null) return;
        c.session.status = 'running';
        c.session.startedAt = this.now();
        c.session.model = c.model.model ?? TEAM_MODEL.model;
        this.hand(c, n);
      });
    } else {
      this.after(c, 200, () => this.hand(c, n));
    }
    return this.dto(c, actor);
  }

  cancel(actor: string, id: string): Conversation {
    const c = this.own(actor, id);
    const open = this.openTurn(c);
    if (open === undefined)
      throw invalid('No question is waiting or being answered');
    open.status = 'cancelled';
    open.error = `cancelled by ${actor}`;
    open.liveText = null;
    open.activity = [];
    open.endedAt = this.now();
    if (c.session !== null) c.session.cancelRequested = true;
    this.after(c, 500, () => this.endSession(c));
    c.updatedAt = this.now();
    return this.dto(c, actor);
  }

  /**
   * `GET /conversations/{id}/stream`, as the real API: `404` before it opens for a conversation the actor cannot read,
   * then `event: conversation` with the conversation now and again each time it changes; it ends when the conversation
   * is deleted.
   */
  stream(actor: string, id: string): MockStream {
    let last = JSON.stringify(this.get(actor, id));
    const encoder = new TextEncoder();
    let timer: Cancel | null = null;
    let open = true;
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    const end = (): void => {
      open = false;
      timer?.();
      timer = null;
      this.streams.delete(handle);
    };
    const write = (json: string): void => {
      controller?.enqueue(
        encoder.encode(`event: conversation\ndata: ${json}\n\n`)
      );
    };
    const tick = (): void => {
      timer = null;
      if (!open) return;
      let now: string;
      try {
        now = JSON.stringify(this.get(actor, id));
      } catch {
        end();
        controller?.close();
        return;
      }
      if (now !== last) {
        last = now;
        write(now);
      }
      timer = this.clock.schedule(CONVERSATION_STREAM_POLL_MS, tick);
    };
    const handle: OpenStream = {
      close: () => {
        if (!open) return;
        end();
        try {
          controller?.close();
        } catch {
          // Already closed or errored by its reader.
        }
      },
      fail: (reason: unknown) => {
        if (!open) return;
        end();
        try {
          controller?.error(reason);
        } catch {
          // Already closed.
        }
      },
    };
    const body = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
        this.streams.add(handle);
        write(last);
        timer = this.clock.schedule(CONVERSATION_STREAM_POLL_MS, tick);
      },
      cancel: end,
    });
    return { body, abort: (reason?: unknown) => handle.fail(reason) };
  }

  /** Breaks every open conversation stream, as a dropped connection would; returns how many there were. */
  dropStreams(
    reason: unknown = new TypeError('the mock dropped the conversation stream')
  ): number {
    const open = [...this.streams];
    for (const s of open) s.fail(reason);
    return open.length;
  }

  /** Cancels every timer and ends every open stream (the server is closing or being reset). */
  stopAll(): void {
    for (const c of this.conversations.values()) c.timer?.();
    for (const s of [...this.streams]) s.close();
  }

  private insert(
    owner: string,
    title: string,
    recipe: Conversation['recipe'],
    at: string
  ): ConversationRecord {
    const c: ConversationRecord = {
      id: this.id(),
      key: `CONV-${this.nextKey++}`,
      title,
      recipe,
      owner,
      shared: false,
      createdAt: at,
      updatedAt: at,
      context: this.productDefaults.repositories.map((ref) => ({
        kind: 'repository' as const,
        ref,
        label: null,
      })),
      lookUp: { jira: true, confluence: true },
      model: { model: null, reasoningEffort: null },
      jiraProject: this.productDefaults.jiraProject,
      confluenceSpaces: [...this.productDefaults.confluenceSpaces],
      turns: [],
      session: null,
      spentBefore: 0,
      timer: null,
    };
    this.conversations.set(c.id, c);
    return c;
  }

  /** Creates a story proposal in the pretend Jira, once: `<project>-41`, `-42`… Its conversation's owner only. */
  createIssue(
    actor: string,
    proposalId: string,
    body: ProposalIssueRequest
  ): Conversation {
    const { c, turn, proposal } = this.ownProposal(actor, proposalId);
    if (proposal.done === null) {
      if (proposal.kind !== 'story')
        throw invalid(
          'Only a story proposal is created in Jira; add a topic to a meeting'
        );
      const key = `${body.projectKey.toUpperCase()}-${++this.nextIssue}`;
      this.markDone(c, turn, proposal, actor, {
        jiraKey: key,
        jiraUrl: `https://jira.example.com/browse/${key}`,
        meetingId: null,
        meetingTitle: null,
        topicId: null,
        note: null,
      });
    }
    return this.dto(c, actor);
  }

  /** Applies a Jira change proposal, once, as the server would through Jira's REST API. Its conversation's owner only. */
  applyChange(actor: string, proposalId: string): Conversation {
    const { c, turn, proposal } = this.ownProposal(actor, proposalId);
    if (proposal.done === null) {
      const change = proposal.change;
      if (change === undefined)
        throw invalid(
          'Only a Jira change proposal is applied; create a story, add a topic'
        );
      let key: string;
      let note: string;
      switch (change.action) {
        case 'create_epic':
          key = `${change.projectKey}-${++this.nextIssue}`;
          note = `Created epic ${key}${change.issueKeys.length ? ` with ${change.issueKeys.join(', ')}` : ''}.`;
          break;
        case 'move_to_epic':
          key = change.epicKey;
          note = `Moved ${change.issueKeys.join(', ')} into ${key}.`;
          break;
        case 'edit_issue':
          key = change.issueKey;
          note = `Changed ${key}.`;
          break;
      }
      this.markDone(c, turn, proposal, actor, {
        jiraKey: key,
        jiraUrl: `https://jira.example.com/browse/${key}`,
        meetingId: null,
        meetingTitle: null,
        topicId: null,
        note,
      });
    }
    return this.dto(c, actor);
  }

  /** Adds a proposal to a planned or running meeting, once, as a topic with a note. Its conversation's owner only. */
  addToMeeting(
    actor: string,
    proposalId: string,
    body: ProposalTopicRequest
  ): Conversation {
    const { c, turn, proposal } = this.ownProposal(actor, proposalId);
    if (proposal.done === null) {
      if (proposal.kind === 'jira_change')
        throw invalid('A Jira change is applied, not added to a meeting');
      const title = proposal.story?.title ?? proposal.topic?.title ?? '';
      const note =
        proposal.topic?.note ??
        (proposal.story === undefined
          ? ''
          : [
              `As ${proposal.story.role}, I want ${proposal.story.want} so that ${proposal.story.soThat}.`,
              '',
              'Acceptance criteria:',
              ...proposal.story.acceptanceCriteria.map((a) => `- ${a}`),
            ].join('\n'));
      const added = this.addMeetingTopic(actor, body.meetingId, title, note);
      this.markDone(c, turn, proposal, actor, {
        jiraKey: null,
        jiraUrl: null,
        meetingId: body.meetingId,
        meetingTitle: added.meetingTitle,
        topicId: added.topicId,
        note: null,
      });
    }
    return this.dto(c, actor);
  }

  private ownProposal(actor: string, proposalId: string) {
    for (const c of this.conversations.values())
      for (const turn of c.turns) {
        const proposal = turn.proposals.find((p) => p.id === proposalId);
        if (proposal === undefined) continue;
        if (c.owner !== actor)
          throw new MockProblem(
            c.shared ? 'forbidden' : 'not_found',
            c.shared
              ? "Only the conversation's owner may change it or ask in it"
              : `Proposal ${proposalId} does not exist`
          );
        return { c, turn, proposal };
      }
    throw new MockProblem('not_found', `Proposal ${proposalId} does not exist`);
  }

  private markDone(
    c: ConversationRecord,
    turn: TurnRecord,
    proposal: ConversationProposal,
    actor: string,
    into: Omit<
      NonNullable<ConversationProposal['done']>,
      'by' | 'byName' | 'at'
    >
  ): void {
    const at = this.now();
    turn.proposals = turn.proposals.map((p) =>
      p.id === proposal.id
        ? {
            ...p,
            done: {
              by: actor,
              byName: KNOWN_NAMES.get(actor) ?? null,
              at,
              ...into,
            },
          }
        : p
    );
    c.updatedAt = at;
  }

  private visible(actor: string, id: string): ConversationRecord {
    const c = this.conversations.get(id);
    if (c === undefined || (c.owner !== actor && !c.shared)) throw notFound(id);
    return c;
  }

  private own(actor: string, id: string): ConversationRecord {
    const c = this.conversations.get(id);
    if (c === undefined || c.owner !== actor) throw notFound(id);
    return c;
  }

  private openTurn(c: ConversationRecord): TurnRecord | undefined {
    return c.turns.find((t) => t.status === 'queued' || t.status === 'handed');
  }

  private after(c: ConversationRecord, ms: number, run: () => void): void {
    c.timer?.();
    c.timer = this.clock.schedule(ms, () => {
      c.timer = null;
      run();
    });
  }

  /** The session takes turn `n` and streams its answer, one step at a time. */
  private hand(c: ConversationRecord, n: number): void {
    const turn = c.turns.find((t) => t.n === n);
    if (turn?.status !== 'queued' || c.session === null) return;
    turn.status = 'handed';
    turn.liveText = '';
    const script = this.script(c, turn);
    let step = 0;
    const next = () => {
      if (turn.status !== 'handed' || c.session === null) return;
      const s = script.steps[step++];
      if (s === undefined) {
        turn.status = 'answered';
        turn.answer = script.answer;
        turn.proposals = script.proposals;
        turn.questions = script.questions;
        turn.liveText = null;
        turn.activity = [];
        turn.endedAt = this.now();
        c.updatedAt = this.now();
        // Warm until idle; the next question goes to this session.
        this.after(c, MOCK_WARM_MS, () => this.endSession(c));
        return;
      }
      if (s.read !== undefined)
        turn.activity = [...turn.activity, s.read].slice(-20);
      if (s.say !== undefined) turn.liveText = `${turn.liveText ?? ''}${s.say}`;
      c.session.spentNanoAiu = Math.min(
        c.session.budgetNanoAiu,
        c.session.spentNanoAiu + STEP_NANO_AIU
      );
      this.after(c, MOCK_STEP_MS, next);
    };
    this.after(c, MOCK_STEP_MS, next);
  }

  private endSession(c: ConversationRecord): void {
    c.timer?.();
    c.timer = null;
    if (c.session === null) return;
    c.spentBefore += c.session.spentNanoAiu;
    c.session = null;
  }

  /** What the pretend agent reads, says, and hands in for a turn: from the recipe and what is pinned. */
  private script(
    c: ConversationRecord,
    turn: TurnRecord
  ): {
    steps: { read?: string; say?: string }[];
    answer: string;
    proposals: ConversationProposal[];
    questions: GrillQuestion[];
  } {
    const reads = [
      `view specs/${c.key}/conversation-request.md`,
      ...c.context.map((x) =>
        x.kind === 'repository'
          ? `grep ${turn.question.split(/\s+/).slice(0, 2).join(' ')} /repos/${x.ref}`
          : `view specs/${c.key}/context/${x.kind}-${x.kind === 'figma' ? 'design' : x.ref}.md`
      ),
    ];
    const pinned = c.context.filter((x) => x.kind === 'jira').map((x) => x.ref);
    const epic = pinned[0] ?? 'the pinned work';
    let answer: string;
    let proposals: ConversationProposal[] = [];
    let questions: GrillQuestion[] = [];
    if (c.recipe === 'split-epic' && turn.n === 1) {
      answer = `I read ${epic} and what else is pinned. It splits into **two stories**, in this order:\n\n1. Charge the late fee, since there is nothing to show until it exists.\n2. Show it on the invoice PDF.\n\nI also propose a meeting topic for the waiver rule, which only finance can settle.`;
      proposals = [
        this.story(
          turn.n,
          'Charge late fees on overdue enterprise invoices',
          [
            'Only enterprise accounts get a late fee.',
            'The fee is 1.5% per month, capped at 10% of the invoice.',
          ],
          [
            {
              label: 'Needs a backend change',
              evidence: 'api/src/billing/fees.ts has no rate per plan',
            },
          ]
        ),
        this.story(
          turn.n,
          'Show the late fee on the invoice PDF',
          [
            'The PDF shows the fee as its own line, with the rate.',
            'Invoices without a fee look as they do today.',
          ],
          []
        ),
        {
          id: this.id(),
          turn: turn.n,
          kind: 'topic',
          topic: {
            title: 'Waivers for late fees',
            note: 'Who may waive a fee, and up to how much? Decide before the first story ships.',
          },
          flags: [],
          done: null,
        },
      ];
      questions = [
        {
          id: 'Q1',
          text: 'Should the fee show on invoices already sent?',
          options: [
            {
              label: 'Only new ones',
              detail: 'Sent PDFs stay as they were.',
              recommended: true,
            },
            {
              label: 'All of them',
              detail: 'Sent PDFs are rendered again.',
              recommended: false,
            },
          ],
        },
      ];
    } else if (c.recipe === 'story-ready' && turn.n === 1) {
      answer = `${epic} is **almost ready**. Its acceptance criteria are testable, but it does not say what happens to invoices already sent, and the design has no state for a waived fee.`;
      questions = [
        {
          id: 'Q1',
          text: 'Is a waived fee shown on the invoice?',
          options: [
            {
              label: 'Shown as waived',
              detail: 'The line stays, with 0 and the word waived.',
              recommended: true,
            },
            {
              label: 'Not shown',
              detail: 'The invoice looks as if there was no fee.',
              recommended: false,
            },
          ],
        },
      ];
    } else if (/\bepic\b/i.test(turn.question)) {
      const issues = pinned.length > 0 ? pinned : ['PROJ-123'];
      answer = `${issues.join(' and ')} belong together: I propose **a new epic** for late fees with them in it, and a label on ${issues[0]} so finance finds it.`;
      proposals = [
        {
          id: this.id(),
          turn: turn.n,
          kind: 'jira_change',
          change: {
            action: 'create_epic',
            projectKey: issues[0]!.split('-')[0]!,
            summary: 'Late fees for enterprise accounts',
            description:
              'Charging late fees on overdue enterprise invoices, and showing them on the PDF.',
            issueKeys: issues,
          },
          reason: 'The pinned work is one feature; an epic keeps it together.',
          flags: [],
          done: null,
        },
        {
          id: this.id(),
          turn: turn.n,
          kind: 'jira_change',
          change: {
            action: 'edit_issue',
            issueKey: issues[0]!,
            summary: null,
            description: null,
            addLabels: ['late-fees'],
            removeLabels: [],
          },
          reason: 'Finance filters its board by this label.',
          flags: [],
          done: null,
        },
      ];
    } else {
      answer =
        c.context.length === 0
          ? 'Nothing is pinned, so this comes from the content repository’s knowledge only: late fees are not charged today, and overdue invoices get three reminders.'
          : `From what is pinned: ${c.context.map((x) => `\`${x.label ?? x.ref}\``).join(', ')}. The short answer is yes, with the rule finance agreed in the last meeting.`;
    }
    const words = answer.split(/(?<=\s)/);
    const chunk = Math.max(1, Math.ceil(words.length / 4));
    const steps: { read?: string; say?: string }[] = reads.map((read) => ({
      read,
    }));
    for (let i = 0; i < words.length; i += chunk)
      steps.push({ say: words.slice(i, i + chunk).join('') });
    return { steps, answer, proposals, questions };
  }

  private story(
    turn: number,
    title: string,
    criteria: string[],
    flags: { label: string; evidence: string }[]
  ): ConversationProposal {
    return {
      id: this.id(),
      turn,
      kind: 'story',
      story: {
        title,
        role: 'a finance user',
        want: `Ahoy to ${title.charAt(0).toLowerCase()}${title.slice(1)}`,
        soThat: 'customers pay on time and see why they pay more',
        context: null,
        implementedFeature: null,
        acceptanceCriteria: criteria,
        outOfScope: [],
        dependencies: [],
        testNotes: [],
        openQuestions: [],
      },
      flags,
      done: null,
    };
  }

  private summary(c: ConversationRecord): ConversationSummary {
    return {
      id: c.id,
      key: c.key,
      title: c.title,
      recipe: c.recipe,
      owner: c.owner,
      ownerName: KNOWN_NAMES.get(c.owner) ?? null,
      shared: c.shared,
      turnCount: c.turns.length,
      lastQuestion: c.turns.at(-1)?.question ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  private dto(c: ConversationRecord, actor: string): Conversation {
    const s = c.session;
    return {
      ...this.summary(c),
      canAsk: c.owner === actor,
      context: c.context.map((x) => ({ ...x })),
      turns: c.turns.map((t) => ({
        ...t,
        activity: [...t.activity],
        proposals: [...t.proposals],
        questions: [...t.questions],
      })),
      session:
        s === null
          ? null
          : {
              id: s.id,
              status: s.status,
              warm: s.status === 'running',
              model: s.model,
              budgetNanoAiu: s.budgetNanoAiu,
              spentNanoAiu: s.spentNanoAiu,
              cancelRequested: s.cancelRequested,
              startedAt: s.startedAt,
            },
      spentNanoAiu: c.spentBefore + (s?.spentNanoAiu ?? 0),
      // The mock's Product agent has Jira tools and no Confluence server.
      lookUp: {
        jira: { on: c.lookUp.jira, available: true },
        confluence: { on: c.lookUp.confluence, available: false },
      },
      model: { ...c.model, team: { ...TEAM_MODEL } },
      jiraProject: c.jiraProject,
      confluenceSpaces: [...c.confluenceSpaces],
      teamDefaults: {
        jiraProject: this.productDefaults.jiraProject,
        confluenceSpaces: [...this.productDefaults.confluenceSpaces],
        repositories: [...this.productDefaults.repositories],
      },
    };
  }
}
