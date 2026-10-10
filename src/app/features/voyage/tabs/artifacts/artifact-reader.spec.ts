import { describe, expect, it } from 'vitest';
import { fail, ok } from '@core/api/api-error';
import { CACHE_LIMIT, ArtifactReader, etagFor } from './artifact-reader';
import { FakeContent, fakeSha } from './testing/fake-content';

const KEY = 'PROJ-123';

function setup(
  revisions: Record<number, Record<string, string>> = {
    1: { 'a.md': 'one' },
    2: { 'a.md': 'two' },
  }
) {
  const content = new FakeContent(revisions);
  return { content, reader: new ArtifactReader(content.read) };
}

describe('ArtifactReader.text', () => {
  it('reads a file at a revision, with its ETag, and asks for that revision', async () => {
    const { content, reader } = setup();
    expect(await reader.text(KEY, 'a.md', 1)).toEqual({
      kind: 'text',
      text: 'one',
      etag: etagFor(fakeSha('one')),
    });
    expect(content.requests).toEqual([
      { key: KEY, query: { path: 'a.md', revision: 1 } },
    ]);
  });

  it('makes no second request for what it has read: a revision never changes', async () => {
    const { content, reader } = setup();
    await reader.text(KEY, 'a.md', 1);
    await reader.text(KEY, 'a.md', 1);
    expect(content.requests).toHaveLength(1);
  });

  it('keeps each revision, each path and each voyage apart', async () => {
    const { content, reader } = setup();
    await reader.text(KEY, 'a.md', 1);
    await reader.text(KEY, 'a.md', 2);
    await reader.text('PROJ-124', 'a.md', 1);
    expect(content.requests).toHaveLength(3);
  });

  it('shares a read that is in flight', async () => {
    const { content, reader } = setup();
    const [a, b] = await Promise.all([
      reader.text(KEY, 'a.md', 1),
      reader.text(KEY, 'a.md', 1),
    ]);
    expect(a).toEqual(b);
    expect(content.requests).toHaveLength(1);
  });

  it("remembers a 404 as 'it was not in that revision', and does not ask again", async () => {
    const { content, reader } = setup();
    expect(await reader.text(KEY, 'plan-round-1.md', 1)).toEqual({
      kind: 'absent',
    });
    expect(await reader.text(KEY, 'plan-round-1.md', 1)).toEqual({
      kind: 'absent',
    });
    expect(content.requests).toHaveLength(1);
  });

  it('does not remember a failure: the next ask tries again', async () => {
    const { content, reader } = setup();
    content.failures.set('a.md@1', { kind: 'network' });
    expect(await reader.text(KEY, 'a.md', 1)).toEqual({
      kind: 'error',
      error: { kind: 'network' },
    });
    content.failures.clear();
    expect(await reader.text(KEY, 'a.md', 1)).toMatchObject({
      kind: 'text',
      text: 'one',
    });
    expect(content.requests).toHaveLength(2);
  });

  it('does not take a 404 for a failure, nor a 500 for a 404', async () => {
    const { content, reader } = setup();
    content.failures.set('a.md@1', {
      kind: 'problem',
      status: 500,
      code: 'internal_error',
      title: 'Boom',
    });
    expect(await reader.text(KEY, 'a.md', 1)).toMatchObject({ kind: 'error' });
  });

  it('reads an empty file as the empty text', async () => {
    const { reader } = setup({ 1: { 'empty.md': '' } });
    expect(await reader.text(KEY, 'empty.md', 1)).toMatchObject({
      kind: 'text',
      text: '',
    });
  });

  it('forgets the oldest answers beyond its limit and keeps the newest', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i <= CACHE_LIMIT; i++) files[`f${i}.md`] = `text ${i}`;
    const { content, reader } = setup({ 1: files });
    for (let i = 0; i <= CACHE_LIMIT; i++)
      await reader.text(KEY, `f${i}.md`, 1);
    const before = content.requests.length;
    await reader.text(KEY, `f${CACHE_LIMIT}.md`, 1);
    expect(content.requests).toHaveLength(before);
    await reader.text(KEY, 'f0.md', 1);
    expect(content.requests).toHaveLength(before + 1);
  });

  it('forgets the least recently used answer, not the oldest: reading again keeps a file', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i <= CACHE_LIMIT; i++) files[`f${i}.md`] = `text ${i}`;
    const { content, reader } = setup({ 1: files });
    for (let i = 0; i < CACHE_LIMIT; i++) await reader.text(KEY, `f${i}.md`, 1);
    await reader.text(KEY, 'f0.md', 1);
    await reader.text(KEY, `f${CACHE_LIMIT}.md`, 1);
    const before = content.requests.length;
    await reader.text(KEY, 'f0.md', 1);
    expect(content.requests).toHaveLength(before);
    await reader.text(KEY, 'f1.md', 1);
    expect(content.requests).toHaveLength(before + 1);
  });

  it('remembers the paths it has seen for a voyage, once each, in the order they appeared', async () => {
    const { reader } = setup();
    reader.learn(KEY, 'b.md', 2, etagFor('x'));
    await reader.text(KEY, 'a.md', 1);
    reader.learn(KEY, 'b.md', 2, etagFor('x'));
    expect(reader.paths(KEY)).toEqual(['b.md', 'a.md']);
    expect(reader.paths('PROJ-124')).toEqual([]);
  });
});

describe('ArtifactReader.sameness', () => {
  it("asks with If-None-Match and takes a 304 as 'same', without the text", async () => {
    const { content, reader } = setup({
      4: { 'a.md': 'same text' },
      5: { 'a.md': 'same text' },
    });
    const etag = etagFor(fakeSha('same text'));
    expect(await reader.sameness(KEY, 'a.md', 4, etag)).toEqual({
      kind: 'same',
    });
    expect(content.requests).toEqual([
      { key: KEY, query: { path: 'a.md', revision: 4, ifNoneMatch: etag } },
    ]);
  });

  it("takes a 200 as 'different', and keeps the text it brought", async () => {
    const { content, reader } = setup({
      4: { 'a.md': 'old' },
      5: { 'a.md': 'new' },
    });
    expect(
      await reader.sameness(KEY, 'a.md', 4, etagFor(fakeSha('new')))
    ).toEqual({ kind: 'different' });
    expect(await reader.text(KEY, 'a.md', 4)).toMatchObject({
      kind: 'text',
      text: 'old',
    });
    expect(content.requests).toHaveLength(1);
  });

  it("takes a 404 as 'absent'", async () => {
    const { reader } = setup({ 5: { 'plan-round-1.md': 'x' } });
    expect(
      await reader.sameness(KEY, 'plan-round-1.md', 4, etagFor(fakeSha('x')))
    ).toEqual({ kind: 'absent' });
  });

  it('answers from what it knows, with no request, once the ETag of that revision is known', async () => {
    const { content, reader } = setup({ 4: { 'a.md': 'old' } });
    await reader.text(KEY, 'a.md', 4);
    expect(
      await reader.sameness(KEY, 'a.md', 4, etagFor(fakeSha('old')))
    ).toEqual({ kind: 'same' });
    expect(
      await reader.sameness(KEY, 'a.md', 4, etagFor(fakeSha('other')))
    ).toEqual({ kind: 'different' });
    expect(content.requests).toHaveLength(1);
  });

  it('remembers a 304 so asking again is free', async () => {
    const { content, reader } = setup({
      4: { 'a.md': 't' },
      5: { 'a.md': 't' },
    });
    const etag = etagFor(fakeSha('t'));
    await reader.sameness(KEY, 'a.md', 4, etag);
    await reader.sameness(KEY, 'a.md', 4, etag);
    expect(content.requests).toHaveLength(1);
    expect(reader.etag(KEY, 'a.md', 4)).toBe(etag);
  });

  it('keeps the text it holds without an ETag when a probe answers 304, so reading it again is free', async () => {
    const requests: unknown[] = [];
    const answers = [
      ok({ kind: 'content' as const, text: 't', etag: null, mediaType: null }),
      ok({ kind: 'not_modified' as const }),
    ];
    const reader = new ArtifactReader((key, query) => {
      requests.push(query);
      return Promise.resolve(answers[requests.length - 1]!);
    });
    await reader.text(KEY, 'a.md', 4);
    expect(await reader.sameness(KEY, 'a.md', 4, etagFor('t'))).toEqual({
      kind: 'same',
    });
    expect(await reader.text(KEY, 'a.md', 4)).toEqual({
      kind: 'text',
      text: 't',
      etag: etagFor('t'),
    });
    expect(requests).toHaveLength(2);
  });

  it('answers from an ETag the listing taught it (learn), without asking', async () => {
    const { content, reader } = setup();
    reader.learn(KEY, 'a.md', 2, etagFor('abc'));
    expect(reader.etag(KEY, 'a.md', 2)).toBe(etagFor('abc'));
    expect(await reader.sameness(KEY, 'a.md', 2, etagFor('abc'))).toEqual({
      kind: 'same',
    });
    expect(content.requests).toHaveLength(0);
  });

  it('does not let learn overwrite what it has read, and reads the text of a file it only knows the ETag of', async () => {
    const { content, reader } = setup();
    await reader.text(KEY, 'a.md', 1);
    reader.learn(KEY, 'a.md', 1, etagFor('something else'));
    expect(reader.etag(KEY, 'a.md', 1)).toBe(etagFor(fakeSha('one')));
    reader.learn(KEY, 'a.md', 2, etagFor(fakeSha('two')));
    expect(await reader.text(KEY, 'a.md', 2)).toMatchObject({
      kind: 'text',
      text: 'two',
    });
    expect(content.count('a.md', 2)).toBe(1);
  });

  it('returns a failure and does not remember it', async () => {
    const { content, reader } = setup({ 4: { 'a.md': 't' } });
    content.failures.set('a.md@4', { kind: 'network' });
    expect(await reader.sameness(KEY, 'a.md', 4, etagFor('x'))).toMatchObject({
      kind: 'error',
    });
    content.failures.clear();
    expect(await reader.sameness(KEY, 'a.md', 4, etagFor('x'))).toEqual({
      kind: 'different',
    });
  });

  it('shares a probe that is in flight', async () => {
    const { content, reader } = setup({ 4: { 'a.md': 't' } });
    const etag = etagFor(fakeSha('t'));
    await Promise.all([
      reader.sameness(KEY, 'a.md', 4, etag),
      reader.sameness(KEY, 'a.md', 4, etag),
    ]);
    expect(content.requests).toHaveLength(1);
  });

  it('never takes a 304 for an answer to a read that sent nothing to match', async () => {
    const reader = new ArtifactReader(() =>
      Promise.resolve(ok({ kind: 'not_modified' }))
    );
    expect(await reader.text(KEY, 'a.md', 1)).toMatchObject({
      kind: 'error',
      error: { kind: 'invalid_response' },
    });
  });

  it('passes the voyage key to the API untouched', async () => {
    const seen: string[] = [];
    const reader = new ArtifactReader((key) => {
      seen.push(key);
      return Promise.resolve(fail({ kind: 'network' }));
    });
    await reader.text('PROJ-9', 'a.md', 1);
    expect(seen).toEqual(['PROJ-9']);
  });
});
