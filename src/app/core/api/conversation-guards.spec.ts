import { describe, expect, it } from 'vitest';
import askConversation from '@testing/fixtures/askConversation.json';
import cancelConversationTurn from '@testing/fixtures/cancelConversationTurn.json';
import createConversation from '@testing/fixtures/createConversation.json';
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
});

describe('isConversationList', () => {
  it('accepts the list, one’s own and the shared ones, and an empty one', () => {
    expect(isConversationList.explain(listConversations)).toBeNull();
    expect(isConversationList({ items: [] })).toBe(true);
    expect(isConversationList({})).toBe(false);
  });
});
