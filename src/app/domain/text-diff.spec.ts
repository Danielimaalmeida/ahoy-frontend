import { changedBlocks, diffLines, hunks, markdownBlocks } from './text-diff';
import type { DiffLine } from './text-diff';

/** Renders a diff line with a +/-/space prefix, the way the artifact diff shows it. */
function line(line: DiffLine): string {
  const prefix = line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' ';
  return `${prefix}${line.text}`;
}

describe('diffLines', () => {
  it('returns every line as unchanged when the documents are equal', () => {
    expect(diffLines('a\nb\n', 'a\nb\n').map(line)).toEqual([' a', ' b']);
  });

  it('marks only additions when lines are added', () => {
    expect(diffLines('a\n', 'a\nb\n').map(line)).toEqual([' a', '+b']);
  });

  it('marks only removals when lines are removed', () => {
    expect(diffLines('a\nb\n', 'a\n').map(line)).toEqual([' a', '-b']);
  });

  it('marks a changed line as a removal and an addition', () => {
    expect(diffLines('a\nb\n', 'a\nb2\n').map(line)).toEqual([
      ' a',
      '-b',
      '+b2',
    ]);
  });

  it('shows a moved line as a removal and an addition', () => {
    expect(diffLines('a\nb\nc\n', 'b\nc\na\n').map(line)).toEqual([
      '-a',
      ' b',
      ' c',
      '+a',
    ]);
  });

  it('handles two empty documents', () => {
    expect(diffLines('', '')).toEqual([]);
  });

  it('treats every line of an empty document as new', () => {
    expect(diffLines('', 'a\nb').map(line)).toEqual(['+a', '+b']);
  });

  it('does not invent a last empty line', () => {
    expect(diffLines('a\nb\n', 'a\nb\n').map(line)).toEqual([' a', ' b']);
    expect(diffLines('', 'a\n').map(line)).toEqual(['+a']);
  });
});

describe('hunks', () => {
  const BEFORE = Array.from({ length: 11 }, (_, index) => `l${index}`).join(
    '\n'
  );
  const AFTER = BEFORE.replace('l5', 'L5');

  it('returns no hunks when nothing changed', () => {
    expect(hunks(diffLines('a\n', 'a\n'))).toEqual([]);
  });

  it('keeps three unchanged lines of context on each side by default', () => {
    const result = hunks(diffLines(BEFORE, AFTER));
    expect(result).toHaveLength(1);
    expect(result[0]!.lines.map(line)).toEqual([
      ' l2',
      ' l3',
      ' l4',
      '-l5',
      '+L5',
      ' l6',
      ' l7',
      ' l8',
    ]);
  });

  it('takes the context size as a parameter', () => {
    const result = hunks(diffLines(BEFORE, AFTER), 1);
    expect(result[0]!.lines.map(line)).toEqual([' l4', '-l5', '+L5', ' l6']);
  });

  it('merges changes whose contexts touch', () => {
    const after = BEFORE.replace('l5', 'L5').replace('l8', 'L8');
    const result = hunks(diffLines(BEFORE, after));
    expect(result).toHaveLength(1);
  });

  it('splits changes that are far apart', () => {
    const after = BEFORE.replace('l1', 'L1').replace('l9', 'L9');
    const result = hunks(diffLines(BEFORE, after));
    expect(result).toHaveLength(2);
  });

  it('names the markdown section above the hunk', () => {
    const before =
      '# Summary\nalpha\nbeta\ngamma\ndelta\nepsilon\nzeta\neta\ntheta\n';
    const after = before.replace('zeta', 'ZETA');
    const result = hunks(diffLines(before, after));
    expect(result[0]!.section).toBe('Summary');
    expect(result[0]!.header).toBe('@@ Summary @@');
  });

  it('uses the nearest heading above the hunk, stripping its hashes', () => {
    const before =
      '## WP1 Due date in the invoice API ##\nalpha\nbeta\ngamma\ndelta\nepsilon\nzeta\neta\n';
    const after = before.replace('zeta', 'ZETA');
    expect(hunks(diffLines(before, after))[0]!.header).toBe(
      '@@ WP1 Due date in the invoice API @@'
    );
  });

  it('keeps a hunk inside its section: changes in two close sections are two hunks, with no heading as context', () => {
    const before =
      '## Summary\n\nalpha\nbeta\n\n## Acceptance criteria\n\n- AC1\n- AC2\n';
    const after = before
      .replace('beta', 'BETA')
      .replace('- AC2\n', '- AC2\n- AC3\n');
    const result = hunks(diffLines(before, after));
    expect(result.map((hunk) => hunk.header)).toEqual([
      '@@ Summary @@',
      '@@ Acceptance criteria @@',
    ]);
    expect(result[0]!.lines.map(line)).toEqual([
      ' ',
      ' alpha',
      '-beta',
      '+BETA',
      ' ',
    ]);
    expect(result[1]!.lines.map(line)).toEqual([
      ' ',
      ' - AC1',
      ' - AC2',
      '+- AC3',
    ]);
  });

  it('merges across a heading that itself changed, and names the section of the first change', () => {
    const before = '## Summary\n\nalpha\n\n## WP1 Old name\n\n- one\n';
    const after = '## Summary\n\nALPHA\n\n## WP1 New name\n\n- one\n';
    const result = hunks(diffLines(before, after));
    expect(result).toHaveLength(1);
    expect(result[0]!.header).toBe('@@ Summary @@');
  });

  it('uses @@ @@ when there is no heading above', () => {
    expect(hunks(diffLines(BEFORE, AFTER))[0]!.header).toBe('@@ @@');
  });
});

describe('markdownBlocks', () => {
  it('splits on blank lines and trims each block', () => {
    expect(markdownBlocks('alpha\n\n\nbeta\n')).toEqual(['alpha', 'beta']);
  });

  it('keeps a fenced code block whole even when it contains blank lines', () => {
    expect(
      markdownBlocks('alpha\n\n```\ncode\n\nmore code\n```\n\nbeta')
    ).toEqual(['alpha', '```\ncode\n\nmore code\n```', 'beta']);
  });

  it('returns no blocks for an empty document', () => {
    expect(markdownBlocks('')).toEqual([]);
    expect(markdownBlocks('\n\n')).toEqual([]);
  });
});

describe('changedBlocks', () => {
  it('returns nothing when there is no previous revision', () => {
    expect(changedBlocks(null, 'alpha\n\nbeta')).toEqual([]);
  });

  it('returns nothing when the documents are equal', () => {
    expect(changedBlocks('alpha\n\nbeta', 'alpha\n\nbeta')).toEqual([]);
  });

  it('marks a new block', () => {
    expect(changedBlocks('alpha\n\nbeta', 'alpha\n\nbeta\n\ngamma')).toEqual([
      2,
    ]);
  });

  it('marks a changed block', () => {
    expect(changedBlocks('alpha\n\nbeta', 'alpha\n\nbeta changed')).toEqual([
      1,
    ]);
  });

  it('does not mark a removed block (it no longer exists in the new document)', () => {
    expect(changedBlocks('alpha\n\nbeta\n\ngamma', 'alpha\n\ngamma')).toEqual(
      []
    );
  });

  it('marks every block when the previous document was empty', () => {
    expect(changedBlocks('', 'alpha\n\nbeta')).toEqual([0, 1]);
  });

  it('marks several changes in one pass', () => {
    expect(
      changedBlocks(
        'alpha\n\nbeta\n\ngamma',
        'alpha changed\n\nbeta\n\ngamma\n\ndelta'
      )
    ).toEqual([0, 3]);
  });
});
