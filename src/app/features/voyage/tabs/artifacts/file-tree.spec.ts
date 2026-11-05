import { buildTree, extensionOf, splitPath, stemOf } from './file-tree';

describe('file tree', () => {
  it('splits a path into its folder and name', () => {
    expect(splitPath('design/frames/118-4993.png')).toEqual({
      dir: 'design/frames',
      name: '118-4993.png',
    });
    expect(splitPath('plan.md')).toEqual({ dir: '', name: 'plan.md' });
  });

  it('reads the extension in upper case, and none from a dot file', () => {
    expect(extensionOf('density.md')).toBe('MD');
    expect(extensionOf('a.b.json')).toBe('JSON');
    expect(extensionOf('.env')).toBe('');
    expect(extensionOf('README')).toBe('');
  });

  it('cuts the stem at the first double dash, so variants share the frame they come from', () => {
    expect(stemOf('118-4993.png')).toBe('118-4993');
    expect(stemOf('118-4993.json')).toBe('118-4993');
    expect(stemOf('118-4993--118-4994.png')).toBe('118-4993');
    expect(stemOf('--odd.md')).toBe('--odd');
  });

  it('puts the top-level files first, then each folder by name', () => {
    const tree = buildTree([
      'design/frames/a.png',
      'state.json',
      'design/density.md',
      'plan.md',
    ]);
    expect(tree.map((folder) => folder.dir)).toEqual([
      '',
      'design',
      'design/frames',
    ]);
    expect(tree.map((folder) => folder.count)).toEqual([2, 1, 1]);
  });

  it("gathers a frame's image, its JSON and its variants into one entry, the frame's own files first", () => {
    const [frames] = buildTree([
      'design/frames/140-21147--140-21149.png',
      'design/frames/118-4993.png',
      'design/frames/140-21147.json',
      'design/frames/140-21147--140-21148.png',
      'design/frames/140-21147.png',
      'design/frames/118-4993--118-4994.png',
      'design/frames/118-4993.json',
      'design/frames/200-1.png',
    ]);
    expect(frames?.count).toBe(8);
    expect(
      frames?.entries.map((entry) =>
        entry.kind === 'file'
          ? entry.file.name
          : `${entry.stem}: ${entry.files.map((f) => f.name).join(', ')}`
      )
    ).toEqual([
      '118-4993: 118-4993.json, 118-4993.png, 118-4993--118-4994.png',
      '140-21147: 140-21147.json, 140-21147.png, 140-21147--140-21148.png, 140-21147--140-21149.png',
      '200-1.png',
    ]);
  });

  it('lists a path given twice once', () => {
    expect(buildTree(['a.md', 'a.md'])[0]?.count).toBe(1);
  });
});
