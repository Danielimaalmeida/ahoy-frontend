import type { ApiError } from '@core/api/api-error';
import { confluencePageErrorView, meetingErrorView } from './meeting-errors';

const problem = (status: number, code: string, detail?: string): ApiError => ({
  kind: 'problem',
  status,
  code,
  title: code,
  ...(detail !== undefined ? { detail } : {}),
  instance: 'req-7',
});

describe('meetingErrorView', () => {
  it('says Ahoy could not be reached for a network failure, without blaming the meeting', () => {
    expect(meetingErrorView({ kind: 'network' })).toEqual({
      variant: 'error',
      heading: "Can't reach Ahoy",
      text: "Ahoy didn't answer. Nothing you typed is lost: try again in a moment.",
      tech: 'network',
    });
  });

  it('treats an unreadable answer as a tooling failure, not a verdict', () => {
    const view = meetingErrorView({
      kind: 'invalid_response',
      what: 'getMeeting: topics[0].raisedBy',
    });
    expect(view.heading).toBe('Ahoy sent something unexpected');
    expect(view.tech).toBe('invalid_response · getMeeting: topics[0].raisedBy');
  });

  it('shows the API reason for a meeting that changed meanwhile as a notice', () => {
    expect(
      meetingErrorView(problem(409, 'invalid_state', 'The meeting has ended.'))
    ).toEqual({
      variant: 'notice',
      heading: 'The meeting changed',
      text: 'The meeting has ended.',
      tech: '409 · invalid_state · req-7',
    });
  });

  it('says the meeting does not exist on a 404', () => {
    expect(meetingErrorView(problem(404, 'not_found')).heading).toBe(
      "This meeting doesn't exist"
    );
  });

  it('passes on the reason the API gave for a refused value', () => {
    const view = meetingErrorView(
      problem(
        400,
        'validation_failed',
        'title is required for a meeting outside a series'
      )
    );
    expect([view.heading, view.text]).toEqual([
      'Ahoy refused that',
      'title is required for a meeting outside a series',
    ]);
  });
});

describe('confluencePageErrorView', () => {
  it('says where an admin connects Confluence when it is not connected', () => {
    expect(confluencePageErrorView(problem(409, 'invalid_state'))).toEqual({
      variant: 'notice',
      heading: "The page can't be created",
      text: 'Confluence is not connected: an admin connects it in Team settings › Confluence.',
      tech: '409 · invalid_state · req-7',
    });
  });

  it('passes on why Confluence refused the title or could not be reached', () => {
    const taken = confluencePageErrorView(
      problem(
        400,
        'validation_failed',
        'Space PROJ already has a page called "Finance sync"; choose another title'
      )
    );
    expect([taken.heading, taken.text]).toEqual([
      'Confluence refused that',
      'Space PROJ already has a page called "Finance sync"; choose another title',
    ]);
    expect(confluencePageErrorView(problem(503, 'unavailable')).heading).toBe(
      "Confluence didn't take the page"
    );
    expect(confluencePageErrorView({ kind: 'network' }).heading).toBe(
      "Can't reach Ahoy"
    );
  });
});
