import type { ApiError } from '@core/api/api-error';
import { checkRefinementCap, refinementErrorView } from './refinement-dialogs';

describe('checkRefinementCap', () => {
  it('reads an empty limit as none, so the server cap applies', () => {
    expect(checkRefinementCap('')).toEqual({ cap: null });
    expect(checkRefinementCap('   ')).toEqual({ cap: null });
  });

  it('reads an amount in AIU as nano-AIU without floats', () => {
    expect(checkRefinementCap('5')).toEqual({ cap: 5_000_000_000 });
    expect(checkRefinementCap(' 2.5 ')).toEqual({ cap: 2_500_000_000 });
    expect(checkRefinementCap('0.000000001')).toEqual({ cap: 1 });
  });

  it('refuses what is not an amount, and zero', () => {
    expect(checkRefinementCap('1e3')).toEqual({ error: 'amount' });
    expect(checkRefinementCap('-1')).toEqual({ error: 'amount' });
    expect(checkRefinementCap('1,5')).toEqual({ error: 'amount' });
    expect(checkRefinementCap('0')).toEqual({ error: 'positive' });
    expect(checkRefinementCap('0.0')).toEqual({ error: 'positive' });
  });
});

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
