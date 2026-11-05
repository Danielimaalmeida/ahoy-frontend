/** One file of the list, as the tree places it. */
export interface TreeFile {
  readonly path: string;
  /** The file's name without its folder: `118-4993.png`. */
  readonly name: string;
  /** The extension, upper case, without the dot (`PNG`, `MD`); empty when the name has none. */
  readonly ext: string;
}

/** A file on its own, or the files that share a stem (`118-4993.png`, `118-4993.json`, `118-4993--118-4994.png`). */
export type TreeEntry =
  | { readonly kind: 'file'; readonly file: TreeFile }
  | {
      readonly kind: 'group';
      /** The shared stem: `118-4993`. */
      readonly stem: string;
      readonly files: readonly TreeFile[];
    };

/** The files of one folder; `dir` is empty for files at the top of the set. */
export interface TreeFolder {
  readonly dir: string;
  readonly entries: readonly TreeEntry[];
  /** How many files the folder holds, groups counted by their files. */
  readonly count: number;
}

/** Where a variant's name starts: `118-4993--118-4994.png` is a variant of `118-4993`. */
const VARIANT = '--';

/** The folder and name of a path: `design/frames/a.png` is `design/frames` and `a.png`. */
export function splitPath(path: string): { dir: string; name: string } {
  const slash = path.lastIndexOf('/');
  return slash < 0
    ? { dir: '', name: path }
    : { dir: path.slice(0, slash), name: path.slice(slash + 1) };
}

/** The extension of a name, upper case: `PNG`, `MD`, or empty. A leading dot (`.env`) is not an extension. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toUpperCase();
}

/** The stem a name groups under: the name without its extension, cut at the first `--`. */
export function stemOf(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot <= 0 ? name : name.slice(0, dot);
  const variant = base.indexOf(VARIANT);
  return variant <= 0 ? base : base.slice(0, variant);
}

/** The stem's own files first (by extension), then its variants, by name. */
function memberOrder(stem: string): (a: TreeFile, b: TreeFile) => number {
  const variant = (file: TreeFile): number =>
    file.name.startsWith(stem + VARIANT) ? 1 : 0;
  return (a, b) => variant(a) - variant(b) || a.name.localeCompare(b.name);
}

/**
 * The paths as the list shows them: one folder per directory (the top first, then by name), and in each folder the files
 * that share a stem gathered into one entry, so a design frame, its JSON and its variants read as one thing. A stem
 * with one file stays a plain file. Pure: the order of `paths` does not matter.
 */
export function buildTree(paths: readonly string[]): readonly TreeFolder[] {
  const folders = new Map<string, TreeFile[]>();
  for (const path of new Set(paths)) {
    const { dir, name } = splitPath(path);
    const files = folders.get(dir) ?? [];
    files.push({ path, name, ext: extensionOf(name) });
    folders.set(dir, files);
  }
  return [...folders.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map(([dir, files]) => {
      const stems = new Map<string, TreeFile[]>();
      for (const file of files) {
        const stem = stemOf(file.name);
        stems.set(stem, [...(stems.get(stem) ?? []), file]);
      }
      const entries: TreeEntry[] = [...stems.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([stem, members]): TreeEntry => {
          const [only] = members;
          return members.length === 1 && only !== undefined
            ? { kind: 'file', file: only }
            : {
                kind: 'group',
                stem,
                files: [...members].sort(memberOrder(stem)),
              };
        });
      return { dir, entries, count: files.length };
    });
}
