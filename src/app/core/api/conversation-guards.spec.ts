import { describe, expect, it } from 'vitest';
import addProposalToMeeting from '@testing/fixtures/addProposalToMeeting.json';
import applyJiraChange from '@testing/fixtures/applyJiraChange.json';
import askConversation from '@testing/fixtures/askConversation.json';
import cancelConversationTurn from '@testing/fixtures/cancelConversationTurn.json';
import createConversation from '@testing/fixtures/createConversation.json';
import createProposalIssue from '@testing/fixtures/createProposalIssue.json';
import getConversation from '@testing/fixtures/getConversation.json';
import listConversations from '@testing/fixtures/listConversations.json';
import setConversationContext from '@testing/fixtures/setConversationContext.json';
import updateConversation from '@testing/fixtures/updateConversation.json';
import { isConversation, isConversationList } from './guards';

const [answered, handed] = getConversation.turns;

describe('isConversation', () => {
  it('accepts every answer a conversation command gives', () => {
    for (const fixture of [
      getConversation,
      createConversation,
      updateConversation,
      setConversationContext,
      askConversation,
      cancelConversationTurn,
      createProposalIssue,
      addProposalToMeeting,
      applyJiraChange,
    ])
      expect(isConversation.explain(fixture)).toBeNull();
  });

  it('refuses live text on a turn that is not being answered, and none on one that is', () => {
    expect(
      isConversation.explain({
        ...getConversation,
        turns: [{ ...answered, liveText: 'so far' }, handed],
      })
    ).toContain('liveText must be set exactly while the turn is handed');
    expect(
      isConversation.explain({
        ...getConversation,
        turns: [answered, { ...handed, liveText: null }],
      })
    ).toContain('turns[1].liveText');
  });

  it('refuses a proposal without the story or topic its kind names, and a flag without evidence', () => {
    const story = answered!.proposals[0]!;
    const noStory = Object.fromEntries(
      Object.entries(story).filter(([key]) => key !== 'story')
    );
    expect(
      isConversation.explain({
        ...getConversation,
        turns: [{ ...answered, proposals: [noStory] }, handed],
      })
    ).toContain('story must be set for a story proposal');
    expect(
      isConversation.explain({
        ...getConversation,
        turns: [
          {
            ...answered,
            proposals: [
              { ...story, flags: [{ label: 'Risky', evidence: '' }] },
            ],
          },
          handed,
        ],
      })
    ).not.toBeNull();
  });

  it('refuses what a proposal became when its Jira key or link is not one', () => {
    const [created] = createProposalIssue.turns;
    const story = created!.proposals[0]!;
    const withDone = (done: Record<string, unknown>) => ({
      ...createProposalIssue,
      turns: [
        {
          ...created,
          proposals: [{ ...story, done: { ...story.done, ...done } }],
        },
      ],
    });
    expect(isConversation.explain(withDone({}))).toBeNull();
    expect(isConversation.explain(withDone({ jiraKey: 'proj 141' }))).toContain(
      'jiraKey'
    );
    expect(
      isConversation.explain(withDone({ jiraUrl: 'http://jira/PROJ-141' }))
    ).toContain('jiraUrl');
  });

  it('refuses a key that is not CONV-<n>, an unknown pinned kind and a negative spend', () => {
    expect(isConversation({ ...getConversation, key: 'PROJ-1' })).toBe(false);
    expect(
      isConversation({
        ...getConversation,
        context: [{ kind: 'confluence', ref: 'x', label: null }],
      })
    ).toBe(false);
    expect(isConversation({ ...getConversation, spentNanoAiu: -1 })).toBe(
      false
    );
  });
  it('refuses a Jira change without its reason, or with an action it does not know', () => {
    const turn = applyJiraChange.turns[0]!;
    const change = turn.proposals[3]!;
    const withProposal = (proposal: unknown) => ({
      ...applyJiraChange,
      turns: [{ ...turn, proposals: [proposal] }],
    });
    expect(isConversation(withProposal(change))).toBe(true);
    const noReason: Record<string, unknown> = { ...change };
    delete noReason['reason'];
    expect(isConversation(withProposal(noReason))).toBe(false);
    expect(
      isConversation(
        withProposal({ ...change, change: { action: 'delete_issue' } })
      )
    ).toBe(false);
    expect(
      isConversation(
        withProposal({
          ...change,
          change: {
            action: 'move_to_epic',
            epicKey: 'PROJ-1',
            issueKeys: [],
          },
        })
      )
    ).toBe(false);
  });

  it('refuses a conversation without its look-ups, or with one that is not on and available', () => {
    const { lookUp, ...without } = getConversation;
    expect(isConversation(without)).toBe(false);
    expect(
      isConversation({
        ...getConversation,
        lookUp: { ...lookUp, confluence: { on: 'yes', available: false } },
      })
    ).toBe(false);
    expect(
      isConversation({ ...getConversation, lookUp: { jira: lookUp.jira } })
    ).toBe(false);
  });
});

describe('isConversationList', () => {
  it('accepts the list, one’s own and the shared ones, and an empty one', () => {
    expect(isConversationList.explain(listConversations)).toBeNull();
    expect(isConversationList({ items: [] })).toBe(true);
    expect(isConversationList({})).toBe(false);
  });
});
