import { ok, type ApiError, type ApiResult } from '@core/api/api-error';
import type { ArtifactContentQuery } from '@core/api/types';
import {
  ArtifactImages,
  IMAGE_CACHE_LIMIT,
  type ObjectUrls,
} from './artifact-images';

const NOT_FOUND: ApiError = {
  kind: 'problem',
  status: 404,
  code: 'not_found',
  title: 'Not found',
};

const DOWN: ApiError = { kind: 'network' };

/** Object URLs as numbered strings, with the ones let go. */
function fakeUrls(): ObjectUrls & { revoked: string[] } {
  let n = 0;
  const revoked: string[] = [];
  return {
    create: () => `blob:test/${++n}`,
    revoke: (url) => revoked.push(url),
    revoked,
  };
}

describe('ArtifactImages', () => {
  it('reads an image once, shares a read in flight, and shows it as an object URL', async () => {
    const asked: ArtifactContentQuery[] = [];
    const images = new ArtifactImages(async (_key, query) => {
      asked.push(query);
      return ok(new Blob(['png']));
    }, fakeUrls());

    const [a, b] = await Promise.all([
      images.image('PROJ-123', 'frame.png', 5),
      images.image('PROJ-123', 'frame.png', 5),
    ]);
    expect(a).toEqual({ kind: 'image', url: 'blob:test/1' });
    expect(b).toEqual(a);
    expect(await images.image('PROJ-123', 'frame.png', 5)).toEqual(a);
    expect(asked).toEqual([{ path: 'frame.png', revision: 5 }]);
  });

  it('keeps a 404 as "absent", and asks again after a failure', async () => {
    let answers: ApiResult<Blob>[] = [
      { ok: false, error: NOT_FOUND },
      { ok: false, error: DOWN },
      ok(new Blob(['png'])),
    ];
    let calls = 0;
    const images = new ArtifactImages(async () => {
      calls += 1;
      const [next, ...rest] = answers;
      answers = rest;
      return next!;
    }, fakeUrls());

    expect(await images.image('K', 'gone.png', 1)).toEqual({ kind: 'absent' });
    expect(await images.image('K', 'gone.png', 1)).toEqual({ kind: 'absent' });
    expect((await images.image('K', 'flaky.png', 1)).kind).toBe('error');
    expect((await images.image('K', 'flaky.png', 1)).kind).toBe('image');
    expect(calls).toBe(3);
  });

  it('revokes the least recently used URL when it holds too many', async () => {
    const urls = fakeUrls();
    const images = new ArtifactImages(async () => ok(new Blob(['x'])), urls);
    for (let i = 0; i <= IMAGE_CACHE_LIMIT; i++)
      await images.image('K', `f${i}.png`, 1);
    expect(urls.revoked).toEqual(['blob:test/1']);
  });
});
