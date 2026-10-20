import type { ApiError } from '@core/api/api-error';
import { storyErrorView } from './story-errors';

const problem = (status: number, code: string, detail?: string): ApiError => ({
  kind: 'problem',
  status,
  code,
  title: code,
  ...(detail !== undefined ? { detail } : {}),
  instance: 'req-9',
});

describe('storyErrorView', () => {
  it('says Jira did not take the story when Create gets a 503, and that the draft is kept', () => {
    const view = storyErrorView(problem(503, 'unavailable'), 'create');
    expect(view.heading).toBe("Jira didn't take the story");
    expect(view.text).toContain('The draft is kept');
    expect(view.tech).toBe('503 · unavailable · req-9');
  });

  it('says story drafts are not set up when asking for one gets a 503', () => {
    const view = storyErrorView(
      problem(
        503,
        'unavailable',
        'Story drafts are not configured on this server'
      ),
      'draft'
    );
    expect([view.heading, view.text]).toEqual([
      "Story drafts aren't set up on this server",
      'Story drafts are not configured on this server',
    ]);
  });

  it('says answers cannot be sent now when the grill no longer waits for them, and why', () => {
    const view = storyErrorView(
      problem(
        409,
        'invalid_state',
        'Story draft 9c1e is drafting; only a grill waiting for answers takes them'
      ),
      'answer'
    );
    expect([view.variant, view.heading, view.text]).toEqual([
      'notice',
      "These answers can't be sent now",
      'Story draft 9c1e is drafting; only a grill waiting for answers takes them',
    ]);
    expect(storyErrorView(problem(503, 'unavailable'), 'answer').heading).toBe(
      "Story drafts aren't set up on this server"
    );
  });

  it('shows the API reason for a refused state as a notice', () => {
    const view = storyErrorView(
      problem(
        409,
        'invalid_state',
        'Series Finance sync has no Jira project; set it first'
      ),
      'create'
    );
    expect(view).toEqual({
      variant: 'notice',
      heading: "This story can't go to Jira yet",
      text: 'Series Finance sync has no Jira project; set it first',
      tech: '409 · invalid_state · req-9',
    });
  });

  it('leaves a network failure to the Meetings wording, never as a verdict on the story', () => {
    expect(storyErrorView({ kind: 'network' }, 'create').heading).toBe(
      "Can't reach Ahoy"
    );
  });
});
