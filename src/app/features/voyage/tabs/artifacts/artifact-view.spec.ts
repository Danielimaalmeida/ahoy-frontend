import type { AhoyEvent } from '@core/api/types';
import {
  artifactByteLength,
  artifactComparison,
  artifactRevisions,
  isArtifactRevision,
  type ArtifactRead,
} from './artifact-view';

function event(
  id: string,
  type: string,
  payload: Readonly<Record<string, unknown>>
): AhoyEvent {
  return {
    id,
    storyKey: 'PROJ-123',
    type,
    actor: 'ahoy-reconciler',
    payload,
    createdAt: '2026-10-06T09:48:12.000Z',
  };
}

function content(
  text: string,
  etag: string | null = null,
  mediaType: string | null = 'text/markdown'
): ArtifactRead {
  return { kind: 'content', value: { text, etag, mediaType } };
}

describe('artifact view helpers', () => {
  it('accepts only positive safe integer revisions', () => {
    expect(isArtifactRevision(1)).toBe(true);
    expect(isArtifactRevision(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isArtifactRevision(0)).toBe(false);
    expect(isArtifactRevision(1.5)).toBe(false);
    expect(isArtifactRevision(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isArtifactRevision('5')).toBe(false);
  });

  it('labels revisions with nearby event context and the current artifact run', () => {
    const revisions = artifactRevisions(
      5,
      [
        {
          path: 'implementation-plan.md',
          sha256: 'hash',
          sizeBytes: 10,
          mediaType: 'text/markdown',
          revision: 5,
          runId: 'r-05',
          createdAt: '2026-10-06T09:48:12.000Z',
        },
      ],
      [
        event('1', 'run.finished', { runId: 'r-04' }),
        event('2', 'artifacts.updated', { revision: 4 }),
        event('3', 'decision.recorded', { decision: 'send_back' }),
        event('4', 'artifacts.updated', { revision: 5 }),
      ]
    );

    expect(revisions).toEqual([
      { revision: 1, label: 'Revision 1' },
      { revision: 2, label: 'Revision 2' },
      { revision: 3, label: 'Revision 3' },
      { revision: 4, label: 'Revision 4 (r-04)' },
      { revision: 5, label: 'Revision 5 · current (r-05)' },
    ]);
  });

  it('shows same, new, removed, line counts and JSON changes', () => {
    expect(artifactComparison(content('same'), content('same'))).toEqual({
      kind: 'same',
    });
    expect(
      artifactComparison(
        content('same', '"etag"'),
        content('different', '"etag"')
      )
    ).toEqual({ kind: 'same' });
    expect(artifactComparison({ kind: 'missing' }, content('new'))).toEqual({
      kind: 'new',
    });
    expect(artifactComparison(content('old'), { kind: 'missing' })).toEqual({
      kind: 'removed',
    });
    expect(
      artifactComparison({ kind: 'missing' }, { kind: 'missing' })
    ).toEqual({ kind: 'same' });
    expect(
      artifactComparison(
        content('one\ntwo\nthree\n'),
        content('one\nchanged\nthree\nfour\n')
      )
    ).toEqual({ kind: 'changed', label: '+2 −1' });
    expect(
      artifactComparison(
        content('{"value":1}', null, 'application/json'),
        content('{"value":2}', null, 'application/json')
      )
    ).toEqual({ kind: 'changed', label: 'changed' });
  });

  it('counts bytes as UTF-8 rather than JavaScript characters', () => {
    expect(artifactByteLength('a🙂')).toBe(5);
  });
});
