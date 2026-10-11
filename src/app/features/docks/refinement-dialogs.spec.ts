import type { ApiError } from '@core/api/api-error';
import { refinementErrorView } from './refinement-dialogs';

describe('refinementErrorView', () => {
  const conflict: ApiError = {
    kind: 'problem',
    status: 409,
    code: 'invalid_state',
    title: 'Invalid state',
    instance: 'req-7',
  };

  it('reads a conflict on a request as a refinement already in progress', () => {
    expect(refinementErrorView(conflict, 'request')).toEqual({
      variant: 'notice',
      heading: 'This item already has a refinement in progress',
      text: 'Its row has been refreshed: cancel that one first.',
      tech: '409 · invalid_state · req-7',
    });
  });

  it('reads a conflict on a cancel as nothing left to cancel, with the server’s words when it sent some', () => {
    expect(
      refinementErrorView(
        { ...conflict, detail: 'PROJ-1 has no refinement in progress' },
        'cancel'
      )
    ).toMatchObject({
      variant: 'notice',
      heading: 'Nothing to cancel any more',
      text: 'PROJ-1 has no refinement in progress',
    });
  });

  it('says refinement is not available on a 503 problem', () => {
    expect(
      refinementErrorView(
        {
          kind: 'problem',
          status: 503,
          code: 'unavailable',
          title: 'Unavailable',
        },
        'request'
      )
    ).toMatchObject({
      variant: 'error',
      heading: "Refinement isn't available",
    });
  });

  it('reads a network failure as Ahoy not answering, not as a verdict on the refinement', () => {
    expect(refinementErrorView({ kind: 'network' }, 'request')).toMatchObject({
      variant: 'error',
      heading: "Can't reach Ahoy",
    });
  });
});
