import artifact from '@testing/fixtures/getArtifactContent.json';
import { ManualClock } from './clock';
import { sha256Hex, utf8Length } from './sha256';

describe('sha256Hex', () => {
  it('gives the FIPS 180-4 test vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(
      sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('hashes texts across block boundaries and in UTF-8', () => {
    expect(sha256Hex('a'.repeat(1000))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3'
    );
    expect(sha256Hex('é')).toBe(
      '4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c'
    );
    // 55, 56 and 64 bytes: the padding fits, spills into a second block, and fills a block exactly.
    expect(sha256Hex('x'.repeat(55))).toBe(
      'd5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072'
    );
    expect(sha256Hex('x'.repeat(56))).toBe(
      '04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e'
    );
    expect(sha256Hex('x'.repeat(64))).toBe(
      '7ce100971f64e7001e8fe5a51973ecdfe1ced42befe7ee8d5fd6219506b5393c'
    );
    expect(utf8Length('é€😀')).toBe(2 + 3 + 4);
  });

  it("matches the artifact fixture's sha256, ETag and size", () => {
    expect(`"${sha256Hex(artifact.text)}"`).toBe(artifact.etag);
    expect(utf8Length(artifact.text)).toBe(866);
  });
});

describe('ManualClock', () => {
  it('runs callbacks in time order, ties in the order they were scheduled', () => {
    const clock = new ManualClock('2026-10-06T10:00:00.000Z');
    const seen: string[] = [];
    clock.schedule(20, () => seen.push('b'));
    clock.schedule(10, () => seen.push('a'));
    clock.schedule(20, () => seen.push('c'));
    clock.advance(15);
    expect(seen).toEqual(['a']);
    clock.advance(5);
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(clock.now()).toBe(Date.parse('2026-10-06T10:00:00.020Z'));
  });

  it('runs what a callback schedules within the same advance, and forgets cancelled ones', () => {
    const clock = new ManualClock(0);
    const seen: number[] = [];
    clock.schedule(5, () => {
      seen.push(clock.now());
      clock.schedule(5, () => seen.push(clock.now()));
    });
    const cancel = clock.schedule(7, () => seen.push(-1));
    cancel();
    clock.advance(10);
    expect(seen).toEqual([5, 10]);
    expect(clock.waiting).toBe(0);
  });

  it('refuses to run for ever', () => {
    const clock = new ManualClock(0);
    const again = (): void => {
      clock.schedule(1, again);
    };
    again();
    expect(() => clock.runAll(50)).toThrow(/still busy/);
  });
});
