import { fail, ok, type ApiResult } from '@core/api/api-error';
import type { ArtifactContent } from '@core/api/types';
import {
  MAX_PROBES,
  findComparison,
  type ReadRevision,
} from './plan-comparison';

const content = (text: string): ApiResult<ArtifactContent> =>
  ok({ kind: 'content', text, etag: null, mediaType: null });
const notFound = (): ApiResult<ArtifactContent> =>
  fail({ kind: 'problem', status: 404, code: 'not_found', title: 'Not found' });
const unreachable = (): ApiResult<ArtifactContent> => fail({ kind: 'network' });

/** A reader over `texts` by revision; a revision that is not there is a 404. It records what it was asked for. */
function reader(texts: Readonly<Record<number, string>>): {
  read: ReadRevision;
  asked: number[];
} {
  const asked: number[] = [];
  return {
    asked,
    read: (revision) => {
      asked.push(revision);
      const text = texts[revision];
      return Promise.resolve(text === undefined ? notFound() : content(text));
    },
  };
}

describe('findComparison', () => {
  it('takes the revision just before when its plan differs', async () => {
    const { read, asked } = reader({ 2: 'old', 3: 'new' });
    expect(await findComparison('new', 3, read)).toEqual({
      revision: 2,
      text: 'old',
    });
    expect(asked).toEqual([2]);
  });

  it('skips revisions where the plan did not change, to the one where it did', async () => {
    const { read, asked } = reader({
      1: 'first',
      2: 'second',
      3: 'second',
      4: 'second',
      5: 'second',
    });
    expect(await findComparison('second', 5, read)).toEqual({
      revision: 1,
      text: 'first',
    });
    expect(asked).toEqual([4, 3, 2, 1]);
  });

  it('skips a revision that had no plan (404) and goes on to the one before', async () => {
    const { read } = reader({ 1: 'first', 3: 'second' });
    expect(await findComparison('second', 4, read)).toEqual({
      revision: 1,
      text: 'first',
    });
  });

  it('probes at most five revisions back', async () => {
    const same = Object.fromEntries(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, 'same'])
    );
    const { read, asked } = reader({ ...same, 1: 'much older' });
    expect(await findComparison('same', 8, read)).toBeNull();
    expect(asked).toEqual([7, 6, 5, 4, 3]);
    expect(asked).toHaveLength(MAX_PROBES);
  });

  it('has nothing to compare with at the first revision, and asks for nothing', async () => {
    const { read, asked } = reader({ 1: 'only' });
    expect(await findComparison('only', 1, read)).toBeNull();
    expect(asked).toEqual([]);
  });

  it('finds nothing when no earlier revision had a plan', async () => {
    const { read, asked } = reader({ 4: 'now' });
    expect(await findComparison('now', 4, read)).toBeNull();
    expect(asked).toEqual([3, 2, 1]);
  });

  it('stops at an error that is not a 404: it cannot tell what changed, so it marks nothing', async () => {
    const asked: number[] = [];
    const read: ReadRevision = (revision) => {
      asked.push(revision);
      return Promise.resolve(revision === 4 ? content('same') : unreachable());
    };
    expect(await findComparison('same', 5, read)).toBeNull();
    expect(asked).toEqual([4, 3]);
  });

  it('treats an unchanged answer (304) as the same plan', async () => {
    const read: ReadRevision = (revision) =>
      Promise.resolve(
        revision === 3 ? ok({ kind: 'not_modified' }) : content('older')
      );
    expect(await findComparison('now', 4, read)).toEqual({
      revision: 2,
      text: 'older',
    });
  });

  it('stops asking once told to', async () => {
    const asked: number[] = [];
    let cancelled = false;
    const read: ReadRevision = (revision) => {
      asked.push(revision);
      cancelled = true;
      return Promise.resolve(content('same'));
    };
    expect(await findComparison('same', 5, read, () => cancelled)).toBeNull();
    expect(asked).toEqual([4]);
  });
});
