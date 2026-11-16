import { describe, expect, it } from 'vitest';
import {
  askRefusal,
  CONVERSATION_TURNS_MAX,
  contextChipText,
  conversationGroups,
  conversationSub,
  pollDelay,
  WARM_POLL_MS,
  CONVERSATION_POLL_MS,
  openTurn,
  pinInput,
  pinRefusal,
  sessionLine,
  type ContextItemLike,
  type ConversationLike,
  type ConversationSummaryLike,
  defaultJiraProject,
  isJiraProjectKey,
  jiraChangeTitle,
  lookUpNote,
  quickPins,
  defaultEffortLabel,
  effortChoices,
  modelChoiceChanged,
  modelSwitchNote,
  teamModelLabel,
} from './conversations';

const CONTEXT: readonly ContextItemLike[] = [
  { kind: 'jira', ref: 'PROJ-120', label: null },
  {
    kind: 'meeting_topic',
    ref: 'topic-1',
    label: 'Late fees for enterprise accounts',
  },
  { kind: 'defect', ref: 'PROJ-456', label: 'Late fee shown twice on the PDF' },
  {
    kind: 'figma',
    ref: 'https://www.figma.com/design/AbC123/Billing-invoices?node-id=12-40',
    label: null,
  },
  { kind: 'repository', ref: 'web', label: null },
];
const OPEN: ConversationLike = {
  canAsk: true,
  turns: [
    { n: 1, status: 'answered' },
    { n: 2, status: 'handed' },
  ],
  session: { status: 'running', cancelRequested: false },
};
const DONE: ConversationLike = { ...OPEN, turns: OPEN.turns.slice(0, 1) };

describe('pinning context', () => {
  it('takes a Jira or defect key in capitals, a figma.com link and a repository name', () => {
    expect(pinInput('jira', ' proj-123 ')).toEqual({
      ok: true,
      ref: 'PROJ-123',
    });
    expect(pinInput('defect', 'PROJ-456')).toEqual({
      ok: true,
      ref: 'PROJ-456',
    });
    expect(
      pinInput('figma', 'https://www.figma.com/design/AbC/Billing?node-id=1-2')
    ).toEqual({
      ok: true,
      ref: 'https://www.figma.com/design/AbC/Billing?node-id=1-2',
    });
    expect(pinInput('repository', 'web')).toEqual({ ok: true, ref: 'web' });
  });

  it('says early what the API would refuse', () => {
    expect(pinInput('jira', 'proj 123')).toEqual({
      ok: false,
      message: 'A Jira key, such as PROJ-123.',
    });
    expect(pinInput('jira', ' ')).toEqual({
      ok: false,
      message: 'Type what to pin.',
    });
    expect(pinInput('figma', 'https://example.com/design/x').ok).toBe(false);
    expect(pinInput('repository', '../web').ok).toBe(false);
    expect(pinInput('meeting_topic', 'Late fees').ok).toBe(false);
  });

  it('refuses an item pinned already, and more than the limits', () => {
    const ctx = CONTEXT;
    expect(pinRefusal(ctx, 'jira', 'PROJ-120')).toBe('It is pinned already.');
    expect(pinRefusal(ctx, 'jira', 'PROJ-121')).toBeNull();
    const repos = ['a', 'b', 'c'].map((ref) => ({
      kind: 'repository' as const,
      ref,
      label: null,
    }));
    expect(pinRefusal(repos, 'repository', 'd')).toBe(
      'At most 3 repositories can be pinned.'
    );
    const full = Array.from({ length: 12 }, (_, i) => ({
      kind: 'jira' as const,
      ref: `P-${i}`,
      label: null,
    }));
    expect(pinRefusal(full, 'defect', 'P-99')).toBe(
      'At most 12 items can be pinned.'
    );
  });

  it('names each chip by its key, its title, or a short form of the link', () => {
    expect(CONTEXT.map(contextChipText)).toEqual([
      'PROJ-120',
      'Late fees for enterprise accounts',
      'PROJ-456 · Late fee shown twice on the PDF',
      'Billing invoices',
      'web',
    ]);
  });
});

describe('a conversation’s state', () => {
  it('finds the open question, follows every second while there is one, less often while the session is warm, and stops when it has ended', () => {
    expect(openTurn(OPEN.turns)?.n).toBe(2);
    expect(pollDelay(OPEN)).toBe(CONVERSATION_POLL_MS);
    expect(openTurn(DONE.turns)).toBeNull();
    expect(pollDelay(DONE)).toBe(WARM_POLL_MS);
    expect(pollDelay({ ...DONE, session: null })).toBeNull();
  });

  it('lets only the owner ask, one question at a time, up to the limit', () => {
    expect(askRefusal(OPEN)).toMatch(/still answering/);
    expect(askRefusal(DONE)).toBeNull();
    expect(askRefusal({ ...DONE, canAsk: false })).toMatch(
      /Only the person who started/
    );
    const full = Array.from({ length: CONVERSATION_TURNS_MAX }, (_, i) => ({
      ...DONE.turns[0]!,
      n: i + 1,
    }));
    expect(askRefusal({ ...DONE, turns: full })).toMatch(/its 40 questions/);
  });

  it('says whether a session is starting, answering, warm or none', () => {
    expect(sessionLine(OPEN)).toBe('Answering');
    expect(sessionLine(DONE)).toMatch(
      /^Warm: the next question is answered right away/
    );
    expect(
      sessionLine({ ...DONE, session: { ...DONE.session!, status: 'queued' } })
    ).toBe('Starting a session…');
    expect(
      sessionLine({
        ...DONE,
        session: { ...DONE.session!, cancelRequested: true },
      })
    ).toBe('Stopping…');
    expect(sessionLine({ ...DONE, session: null })).toMatch(
      /^No session running/
    );
    expect(sessionLine({ ...DONE, session: null, turns: [] })).toMatch(
      /^No session yet/
    );
  });
});

describe('the list', () => {
  const items: readonly ConversationSummaryLike[] = [
    {
      key: 'CONV-3',
      owner: 'alex@example.com',
      ownerName: 'Alex Example',
      turnCount: 2,
      updatedAt: '2026-11-03T09:14:00.000Z',
    },
    {
      key: 'CONV-4',
      owner: 'alex@example.com',
      ownerName: 'Alex Example',
      turnCount: 0,
      updatedAt: '2026-11-04T10:00:00.000Z',
    },
    {
      key: 'CONV-2',
      owner: 'sam@example.com',
      ownerName: 'Sam Example',
      turnCount: 3,
      updatedAt: '2026-11-02T15:00:00.000Z',
    },
  ];

  it('splits one’s own from the team’s shared ones, the latest changed first', () => {
    const groups = conversationGroups(
      items,
      (owner) => owner === 'alex@example.com'
    );
    expect(groups.mine.map((c) => c.key)).toEqual(['CONV-4', 'CONV-3']);
    expect(groups.shared.map((c) => c.key)).toEqual(['CONV-2']);
  });

  it('says the key, how many questions, and whose it is when not one’s own', () => {
    expect(conversationSub(items[0]!, true)).toBe('CONV-3 · 2 questions');
    expect(conversationSub(items[2]!, false)).toBe(
      'CONV-2 · 3 questions · Sam Example'
    );
    expect(conversationSub({ ...items[0]!, turnCount: 0 }, true)).toBe(
      'CONV-3 · no questions'
    );
  });
});

describe('Jira projects for a story proposal', () => {
  it('takes a project key in any case, and nothing with spaces or a dash', () => {
    expect(isJiraProjectKey('PROJ')).toBe(true);
    expect(isJiraProjectKey(' fin_2 ')).toBe(true);
    expect(isJiraProjectKey('PROJ-1')).toBe(false);
    expect(isJiraProjectKey('pro j')).toBe(false);
    expect(isJiraProjectKey('')).toBe(false);
  });

  it('offers the project of the first pinned Jira issue, else of a defect, else nothing', () => {
    expect(
      defaultJiraProject([
        { kind: 'figma', ref: 'https://www.figma.com/design/x' },
        { kind: 'defect', ref: 'BUG-7' },
        { kind: 'jira', ref: 'PROJ-120' },
      ])
    ).toBe('PROJ');
    expect(defaultJiraProject([{ kind: 'defect', ref: 'BUG-7' }])).toBe('BUG');
    expect(defaultJiraProject([{ kind: 'repository', ref: 'web' }])).toBe('');
  });
});

describe('the quick pin box', () => {
  it('offers a Jira key as an issue or a defect, and a lower-case one as a repository too', () => {
    expect(quickPins(' PROJ-456 ')).toEqual([
      { kind: 'jira', ref: 'PROJ-456' },
      { kind: 'defect', ref: 'PROJ-456' },
    ]);
    expect(quickPins('web-2').map((p) => [p.kind, p.ref])).toEqual([
      ['jira', 'WEB-2'],
      ['defect', 'WEB-2'],
      ['repository', 'web-2'],
    ]);
  });

  it('offers a Figma link as one, a repository name as one, and nothing for anything else', () => {
    const link = 'https://www.figma.com/design/AbC123/Billing';
    expect(quickPins(link)).toEqual([{ kind: 'figma', ref: link }]);
    expect(quickPins('web')).toEqual([{ kind: 'repository', ref: 'web' }]);
    expect(quickPins('')).toEqual([]);
    expect(quickPins('not a ref!')).toEqual([]);
    expect(quickPins('https://example.com/design/x')).toEqual([]);
  });
});

describe('what the agent may look up', () => {
  const on = { on: true, available: true };
  const off = { on: false, available: true };
  const missing = { on: true, available: false };

  it('says nothing is set up when neither server is', () => {
    expect(lookUpNote({ jira: missing, confluence: missing }, false)).toMatch(
      /^Not set up: an admin gives the Product agent/
    );
  });

  it('names what it searches, and what is not set up', () => {
    expect(lookUpNote({ jira: on, confluence: on }, false)).toBe(
      'The agent searches Jira and Confluence beyond what is pinned. Turn one off to keep it to the pins.'
    );
    expect(lookUpNote({ jira: on, confluence: missing }, false)).toBe(
      'The agent searches Jira beyond what is pinned. Turn it off to keep it to the pins. Confluence is not set up.'
    );
  });

  it('says what is off and when a change applies: the next question, or once the warm session ends', () => {
    expect(lookUpNote({ jira: on, confluence: off }, false)).toBe(
      'Confluence is off for this conversation: the agent reads only the pinned items and Jira. It applies from the next question.'
    );
    expect(lookUpNote({ jira: off, confluence: off }, true)).toBe(
      'Jira and Confluence are off for this conversation: the agent reads only the pinned items. Changing it ends the warm session: the next question starts a new one.'
    );
  });
});

describe('a Jira change proposal', () => {
  it('is titled by what applying it does', () => {
    expect(
      jiraChangeTitle({
        action: 'create_epic',
        projectKey: 'PROJ',
        summary: 'Late fees',
      })
    ).toBe('New epic in PROJ: Late fees');
    expect(
      jiraChangeTitle({
        action: 'move_to_epic',
        epicKey: 'PROJ-1',
        issueKeys: ['PROJ-2'],
      })
    ).toBe('Move 1 issue into PROJ-1');
    expect(
      jiraChangeTitle({
        action: 'move_to_epic',
        epicKey: 'PROJ-1',
        issueKeys: ['PROJ-2', 'PROJ-3'],
      })
    ).toBe('Move 2 issues into PROJ-1');
    expect(jiraChangeTitle({ action: 'edit_issue', issueKey: 'PROJ-9' })).toBe(
      'Change PROJ-9'
    );
  });
});

describe('the conversation model picker', () => {
  const catalog = [
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', reasoningEfforts: null },
    { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', reasoningEfforts: [] },
    {
      id: 'claude-opus-5.5',
      label: 'Claude Opus 5.5',
      reasoningEfforts: ['medium' as const, 'high' as const],
    },
  ];
  const team = {
    model: 'claude-sonnet-5',
    reasoningEffort: 'medium' as const,
  };

  it("names the team's model as the default, or the agent profile's when the team set none", () => {
    expect(teamModelLabel(catalog, team)).toBe(
      'Claude Sonnet 5 (team default)'
    );
    expect(
      teamModelLabel(catalog, { model: null, reasoningEffort: null })
    ).toBe("Agent profile's (team default)");
  });

  it('offers the efforts the catalogue lists for a model, every one when it does not say', () => {
    expect(effortChoices(catalog, 'claude-opus-5.5')).toEqual([
      'medium',
      'high',
    ]);
    expect(effortChoices(catalog, 'claude-haiku-4.5')).toEqual([]);
    expect(effortChoices(catalog, 'unknown-model')).toHaveLength(5);
  });

  it("says the team's effort is the default only under the team's model", () => {
    expect(defaultEffortLabel(null, team)).toBe('Default (medium)');
    expect(defaultEffortLabel('claude-opus-5.5', team)).toBe('Default');
  });

  it('tells a change apart, and says what sending does to the warm session', () => {
    const none = { model: null, reasoningEffort: null };
    expect(modelChoiceChanged(none, none)).toBe(false);
    expect(
      modelChoiceChanged(none, { model: null, reasoningEffort: 'high' })
    ).toBe(true);
    expect(
      modelSwitchNote(
        catalog,
        'claude-sonnet-5',
        { model: 'claude-opus-5.5', reasoningEffort: 'high' },
        team
      )
    ).toBe(
      'The open session runs Claude Sonnet 5. Sending starts a new session with Claude Opus 5.5 (high), carrying the conversation so far.'
    );
  });
});
