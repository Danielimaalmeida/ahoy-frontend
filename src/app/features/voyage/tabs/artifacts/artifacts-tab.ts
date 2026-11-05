import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { apiErrorView } from '@core/commands/command-error';
import { ArtifactDiff } from '@ui/artifact-diff/artifact-diff';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';
import { Markdown } from '@ui/markdown/markdown';
import { Panel, PanelBody, PanelHead } from '@ui/panel/panel';
import { SectionTabs, type SectionTab } from '@ui/section-tabs/section-tabs';
import { Skeleton } from '@ui/skeleton/skeleton';
import { formatSize, kindLabel, PREVIEW_LIMIT_BYTES } from './artifact-files';
import { ArtifactsView } from './artifacts-view';
import { statusLabel, type FileState } from './file-compare';
import { buildTree, splitPath, type TreeFile } from './file-tree';

const VIEW_ONLY: readonly SectionTab[] = [{ id: 'view', label: 'View' }];
const VIEW_OR_COMPARE: readonly SectionTab[] = [
  { id: 'view', label: 'View' },
  { id: 'compare', label: 'Compare' },
];

/** How a row's status reads at a glance. */
type Tone = 'same' | 'new' | 'removed' | 'changed' | 'pending' | 'problem';

/** One row of the file list. */
interface FileRow {
  readonly path: string;
  /** The ext badge: `MD`, `JSON`, `PNG`. */
  readonly ext: string;
  /** The name as the row shows it, after a dimmed lead: `↳ ` + `118-4994` for a frame's variant. */
  readonly dim: string;
  readonly rest: string;
  /** "Markdown · " for screen readers, ahead of the size. */
  readonly typeSr: string;
  /** View only: the size, when the open revision is the current one; empty otherwise. */
  readonly size: string;
  /** Compare only: `same`, `+9 −3`, `new`… */
  readonly status: string;
  readonly tone: Tone;
  /** Compare only: whether the file is the same in both revisions. */
  readonly same: boolean;
  readonly open: boolean;
  /** The query of the link on the row: the same mode, this file. */
  readonly link: Record<string, string>;
}

/** A row of the list: one file, or a stem's files under one heading. */
type Entry =
  | { readonly kind: 'file'; readonly key: string; readonly row: FileRow }
  | {
      readonly kind: 'group';
      readonly key: string;
      readonly stem: string;
      readonly rows: readonly FileRow[];
      readonly summary: string;
      readonly open: boolean;
    };

/** One folder of the list, with what its heading says ("12 files", "3 changed"). */
interface Folder {
  readonly dir: string;
  readonly entries: readonly Entry[];
  readonly summary: string;
}

function toneOf(state: FileState | undefined): Tone {
  switch (state?.kind) {
    case undefined:
    case 'loading':
      return 'pending';
    case 'same':
    case 'missing':
      return 'same';
    case 'new':
      return 'new';
    case 'removed':
      return 'removed';
    case 'changed':
      return 'changed';
    default:
      return 'problem';
  }
}

/** "1 file", "12 files". */
function files(count: number): string {
  return `${count} ${count === 1 ? 'file' : 'files'}`;
}

/** A heading's summary: the file count in View; in Compare, how many changed ("3 changed", "same"). */
function summarize(rows: readonly FileRow[], compare: boolean): string {
  if (!compare) return files(rows.length);
  const changed = rows.filter((row) => !row.same);
  if (changed.length === 0) return 'same';
  return changed.every((row) => row.tone === 'new')
    ? `${changed.length} new`
    : `${changed.length} changed`;
}

/**
 * The Artifacts tab (lane 5C, `Records` board): the voyage's files at any revision of its set. Pick two revisions and see
 * how each file changed (`same`, `+9 −3`, `new`), read a file as markdown, JSON or text, or compare it line by line with
 * the section named at each hunk. The API lists only the current revision, so earlier ones are asked for file by file, and
 * only when the page needs them. File contents come from agents: they are shown as text, never as HTML. Read-only.
 */
@Component({
  selector: 'ah-artifacts-tab',
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    ArtifactDiff,
    Banner,
    Button,
    EmptyState,
    Markdown,
    Panel,
    PanelBody,
    PanelHead,
    SectionTabs,
    Skeleton,
  ],
  providers: [ArtifactsView],
  styleUrl: './artifacts-tab.scss',
  template: `
    <ah-panel>
      <ah-panel-head
        heading="Artifacts"
        subtitle="Every change makes a new revision of the whole set."
      >
        @if (view.status() === 'ready' && view.current() > 0) {
          <div ahPanelActions class="artifacts__controls">
            @if (selection().mode === 'compare') {
              <label for="artifacts-base" class="ah-hint">Compare</label>
              <select
                id="artifacts-base"
                class="ah-input artifacts__select"
                [formControl]="baseControl"
              >
                @for (option of baseOptions(); track option.revision) {
                  <option [ngValue]="option.revision">
                    {{ option.label }}
                  </option>
                }
              </select>
              <label for="artifacts-target" class="ah-hint">with</label>
            } @else {
              <label for="artifacts-target" class="ah-hint">Revision</label>
            }
            <select
              id="artifacts-target"
              class="ah-input artifacts__select"
              [formControl]="targetControl"
            >
              @for (option of view.options(); track option.revision) {
                <option [ngValue]="option.revision">{{ option.label }}</option>
              }
            </select>
            <ah-section-tabs
              variant="pill"
              label="View or compare"
              [items]="modes()"
              [selected]="selection().mode"
              (selectedChange)="pickMode($event)"
            />
          </div>
        }
      </ah-panel-head>
      @switch (view.status()) {
        @case ('error') {
          <ah-panel-body>
            @if (listError(); as e) {
              <ah-banner
                [variant]="e.variant"
                [heading]="e.heading"
                [tech]="e.tech ?? ''"
                icon="offline"
                >{{ e.text }}
                <span class="artifacts__retry"
                  ><button
                    type="button"
                    ahButton
                    size="sm"
                    (click)="view.retry()"
                  >
                    Try again
                  </button></span
                ></ah-banner
              >
            }
          </ah-panel-body>
        }
        @case ('loading') {
          <ah-panel-body>
            <div aria-busy="true" class="artifacts__loading">
              <span class="ah-sr" role="status">Loading the artifacts…</span>
              <ah-skeleton width="40%" [height]="18" />
              <ah-skeleton width="90%" />
              <ah-skeleton width="75%" />
            </div>
          </ah-panel-body>
        }
        @default {
          @if (view.current() === 0) {
            <ah-empty-state heading="No artifacts yet" icon="compass">
              The files agents write show up here, one revision at a time.
            </ah-empty-state>
          } @else {
            <div class="artifacts__body">
              <nav class="artifacts__files" aria-label="Files">
                <div class="artifacts__tools">
                  <input
                    type="search"
                    class="ah-input artifacts__filter"
                    placeholder="Filter files"
                    aria-label="Filter files"
                    [value]="filter()"
                    (input)="setFilter($event)"
                  />
                  <span class="artifacts__count ah-hint" role="status">{{
                    countLabel()
                  }}</span>
                  @if (selection().mode === 'compare') {
                    <label class="artifacts__only">
                      <input
                        type="checkbox"
                        [checked]="changedOnly()"
                        (change)="changedOnly.set(!changedOnly())"
                      />
                      Changed only
                    </label>
                  }
                </div>
                <div class="artifacts__tree">
                  @for (folder of tree(); track folder.dir) {
                    @if (folder.dir === '') {
                      <ng-container
                        [ngTemplateOutlet]="entriesTpl"
                        [ngTemplateOutletContext]="{ $implicit: folder }"
                      />
                    } @else {
                      <details class="artifacts__folder" [open]="true">
                        <summary class="artifacts__folder-head">
                          <span
                            class="artifacts__chevron"
                            aria-hidden="true"
                          ></span>
                          <span class="ah-mono artifacts__dir"
                            >{{ folder.dir }}/</span
                          >
                          <span class="artifacts__badge">{{
                            folder.summary
                          }}</span>
                        </summary>
                        <ng-container
                          [ngTemplateOutlet]="entriesTpl"
                          [ngTemplateOutletContext]="{ $implicit: folder }"
                        />
                      </details>
                    }
                  } @empty {
                    <p class="ah-hint artifacts__none">
                      @if (filter() !== '') {
                        No file matches “{{ filter() }}”.
                      } @else {
                        No file changed between these revisions.
                      }
                    </p>
                  }
                </div>
              </nav>
              <div class="artifacts__detail">
                @if (selection().path; as path) {
                  <div class="artifacts__detail-head">
                    <span class="ah-mono">{{ path }}</span>
                    <span class="ah-tag">{{ kind(path) }}</span>
                    <span class="ah-hint">{{ describe() }}</span>
                  </div>
                  @let d = view.detail();
                  <div
                    class="artifacts__content"
                    [attr.aria-busy]="d.kind === 'loading'"
                  >
                    @if (d.kind === 'loading') {
                      <div class="artifacts__loading">
                        <span class="ah-sr" role="status"
                          >Reading {{ path }}…</span
                        >
                        <ah-skeleton width="50%" [height]="14" />
                        <ah-skeleton width="90%" />
                        <ah-skeleton width="80%" />
                      </div>
                    } @else if (d.kind === 'text') {
                      @if (d.fileKind === 'markdown') {
                        <ah-markdown class="artifacts__doc" [source]="d.text" />
                      } @else {
                        <pre class="artifacts__pre">{{ d.text }}</pre>
                      }
                    } @else if (d.kind === 'diff') {
                      @if (d.change === 'new') {
                        <p class="ah-hint artifacts__note">
                          New file: it was not in revision
                          {{ selection().base }}.
                        </p>
                      } @else if (d.change === 'removed') {
                        <p class="ah-hint artifacts__note">
                          Removed file: it is not in revision
                          {{ selection().target }}.
                        </p>
                      }
                      <ah-artifact-diff
                        [previous]="d.previous"
                        [next]="d.next"
                        [label]="describe()"
                      />
                    } @else if (d.kind === 'image') {
                      @if (d.change === 'view') {
                        <figure
                          class="artifacts__image artifacts__image--single"
                        >
                          <img [src]="d.next" [alt]="path" />
                        </figure>
                      } @else {
                        @if (d.change === 'new') {
                          <p class="ah-hint artifacts__note">
                            New image: it was not in revision
                            {{ selection().base }}.
                          </p>
                        } @else if (d.change === 'removed') {
                          <p class="ah-hint artifacts__note">
                            Removed image: it is not in revision
                            {{ selection().target }}.
                          </p>
                        }
                        <div class="artifacts__images">
                          @if (d.previous !== null) {
                            <figure
                              class="artifacts__image artifacts__image--before"
                            >
                              <figcaption>
                                Revision {{ selection().base }}
                              </figcaption>
                              <img
                                [src]="d.previous"
                                [alt]="path + ', revision ' + selection().base"
                              />
                            </figure>
                          }
                          @if (d.next !== null) {
                            <figure
                              class="artifacts__image artifacts__image--after"
                            >
                              <figcaption>
                                Revision {{ selection().target }}
                              </figcaption>
                              <img
                                [src]="d.next"
                                [alt]="
                                  path + ', revision ' + selection().target
                                "
                              />
                            </figure>
                          }
                        </div>
                      }
                    } @else if (d.kind === 'same') {
                      <p class="ah-muted artifacts__note">
                        No changes between revision {{ selection().base }} and
                        revision {{ selection().target }}.
                      </p>
                    } @else if (d.kind === 'absent') {
                      <p class="ah-muted artifacts__note">
                        @if (selection().mode === 'compare') {
                          This file is in neither revision.
                        } @else {
                          This file was not in revision
                          {{ selection().target }}.
                        }
                      </p>
                    } @else if (d.kind === 'too_large') {
                      <div class="artifacts__note">
                        <ah-banner
                          variant="info"
                          heading="Too large to preview"
                        >
                          @if (d.bytes !== null) {
                            {{ size(d.bytes) }} is over the {{ limit }} limit.
                          } @else {
                            This file is over the {{ limit }} limit.
                          }
                        </ah-banner>
                      </div>
                    } @else {
                      <div class="artifacts__note">
                        @if (fileError(); as e) {
                          <ah-banner
                            [variant]="e.variant"
                            [heading]="e.heading"
                            [tech]="e.tech ?? ''"
                            icon="offline"
                            >{{ e.text }}
                            <span class="artifacts__retry"
                              ><button
                                type="button"
                                ahButton
                                size="sm"
                                (click)="view.retry()"
                              >
                                Try again
                              </button></span
                            ></ah-banner
                          >
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        }
      }
    </ah-panel>
    <ng-template #entriesTpl let-folder>
      <ul class="artifacts__entries" role="list">
        @for (entry of folder.entries; track entry.key) {
          <li>
            @if (entry.kind === 'file') {
              <ng-container
                [ngTemplateOutlet]="fileTpl"
                [ngTemplateOutletContext]="{ $implicit: entry.row }"
              />
            } @else {
              <details class="artifacts__group" [open]="entry.open">
                <summary class="artifacts__group-head">
                  <span class="artifacts__chevron" aria-hidden="true"></span>
                  <span class="artifacts__stack" aria-hidden="true"></span>
                  <span class="ah-mono artifacts__stem-name">{{
                    entry.stem
                  }}</span>
                  <span class="artifacts__badge">{{ entry.summary }}</span>
                </summary>
                <ul
                  class="artifacts__entries artifacts__entries--nested"
                  role="list"
                >
                  @for (row of entry.rows; track row.path) {
                    <li>
                      <ng-container
                        [ngTemplateOutlet]="fileTpl"
                        [ngTemplateOutletContext]="{ $implicit: row }"
                      />
                    </li>
                  }
                </ul>
              </details>
            }
          </li>
        }
      </ul>
    </ng-template>

    <ng-template #fileTpl let-row>
      <a
        class="artifacts__file"
        [class.artifacts__file--open]="row.open"
        [routerLink]="[]"
        [queryParams]="row.link"
        [attr.aria-current]="row.open ? 'true' : null"
        [attr.data-path]="row.path"
        [title]="row.path"
      >
        <span class="artifacts__ext" aria-hidden="true">{{
          row.ext || '·'
        }}</span>
        <span class="ah-mono artifacts__path"
          ><span class="artifacts__stem">{{ row.dim }}</span
          >{{ row.rest }}</span
        >
        <span class="artifacts__meta"
          ><span class="ah-sr">{{ row.typeSr }}</span
          >{{ row.size }}</span
        >
        @if (row.status !== '') {
          <small class="artifacts__status" [attr.data-tone]="row.tone">{{
            row.status
          }}</small>
        }
      </a>
    </ng-template>
  `,
})
export class ArtifactsTab {
  protected readonly view = inject(ArtifactsView);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly selection = this.view.selection;
  /** The comparison's older revision, as the URL has it (typed, not read off the DOM). */
  protected readonly baseControl = new FormControl(1, { nonNullable: true });
  /** The revision shown (View) or compared (Compare), as the URL has it. */
  protected readonly targetControl = new FormControl(1, { nonNullable: true });
  protected readonly kind = (path: string): string =>
    kindLabel(this.view.kindOf(path));
  protected readonly size = formatSize;
  protected readonly limit = formatSize(PREVIEW_LIMIT_BYTES);

  constructor() {
    // The controls follow the selection, which follows the URL: the URL is the state.
    effect(() => {
      const selection = this.selection();
      untracked(() => {
        if (selection.base !== null)
          this.baseControl.setValue(selection.base, { emitEvent: false });
        this.targetControl.setValue(selection.target, { emitEvent: false });
      });
    });
    // A pick in a control goes to the URL, and the selection follows it. A DOM value that is not a revision (a select
    // the browser left without a matching option) is ignored.
    this.baseControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((base) => {
        if (Number.isSafeInteger(base) && base >= 1) this.view.go({ base });
      });
    this.targetControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((target) => {
        if (Number.isSafeInteger(target) && target >= 1)
          this.view.go({ target });
      });
  }

  protected readonly listError = computed(() => {
    const error = this.view.error();
    return error === null ? null : apiErrorView(error);
  });

  protected readonly fileError = computed(() => {
    const detail = this.view.detail();
    return detail.kind === 'error' ? apiErrorView(detail.error) : null;
  });

  protected readonly modes = computed(() =>
    this.selection().base === null ? VIEW_ONLY : VIEW_OR_COMPARE
  );

  /** The revisions the comparison can start from: those before the target. */
  protected readonly baseOptions = computed(() => {
    const target = this.selection().target;
    return this.view.options().filter((option) => option.revision < target);
  });

  /** "Revision 4 → Revision 5 (current)" or "Revision 5 · current (r-04)", as the selectors word them. */
  protected readonly describe = computed(() => {
    const { mode, base, target } = this.selection();
    const label = (revision: number): string =>
      this.view.options().find((option) => option.revision === revision)
        ?.label ?? `Revision ${revision}`;
    return mode === 'compare' && base !== null
      ? `${label(base)} → ${label(target)}`
      : label(target);
  });

  /** What the filter box holds; the list shows the paths that contain it, whatever the case. */
  protected readonly filter = signal('');
  /** Compare only: hide the files that are the same in both revisions. */
  protected readonly changedOnly = signal(false);

  /** Every file's row, by path. */
  private readonly rows = computed<ReadonlyMap<string, FileRow>>(() => {
    const selection = this.selection();
    const compare = selection.mode === 'compare';
    const changes = this.view.changes();
    const sizesKnown = selection.target === this.view.current();
    const items = new Map(this.view.items().map((item) => [item.path, item]));
    const rows = new Map<string, FileRow>();
    for (const path of this.view.paths()) {
      const change = changes.get(path);
      if (compare && change?.kind === 'missing') continue;
      const item = items.get(path);
      const kind = this.view.kindOf(path);
      const { name } = splitPath(path);
      const size =
        item !== undefined && sizesKnown && !compare
          ? formatSize(item.sizeBytes)
          : '';
      rows.set(path, {
        path,
        ext: '',
        dim: '',
        rest: name,
        typeSr: size === '' ? kindLabel(kind) : `${kindLabel(kind)} · `,
        size,
        status: compare ? statusLabel(change, kind) : '',
        tone: compare ? toneOf(change) : 'same',
        same: compare && change?.kind === 'same',
        open: path === selection.path,
        link: this.view.queryFor({ path }),
      });
    }
    return rows;
  });

  /** The list: folders, then frames and their variants gathered, filtered by the box and "Changed only". */
  protected readonly tree = computed<readonly Folder[]>(() => {
    const compare = this.selection().mode === 'compare';
    const query = this.filter().trim().toLowerCase();
    const hideSame = compare && this.changedOnly();
    const rows = this.rows();
    const shown = [...rows.values()]
      .filter((row) => query === '' || row.path.toLowerCase().includes(query))
      .filter((row) => !hideSame || !row.same)
      .map((row) => row.path);
    // The row of a placed file. Inside a group the stem is the heading, so a variant reads by what makes it one:
    // `118-4993--118-4994.png` is "↳ 118-4994" (the badge says PNG, the title the whole path).
    const place = (file: TreeFile, stem: string): FileRow[] => {
      const row = rows.get(file.path);
      if (row === undefined) return [];
      const variant = stem !== '' && file.name.startsWith(`${stem}--`);
      const tail = file.name.slice(stem.length + 2);
      const dot = tail.lastIndexOf('.');
      return [
        {
          ...row,
          ext: file.ext,
          dim: variant ? '↳ ' : '',
          rest: variant ? (dot > 0 ? tail.slice(0, dot) : tail) : file.name,
        },
      ];
    };
    return buildTree(shown).map((folder) => {
      const entries = folder.entries.flatMap((entry): Entry[] => {
        if (entry.kind === 'file')
          return place(entry.file, '').map((row) => ({
            kind: 'file',
            key: row.path,
            row,
          }));
        const members = entry.files.flatMap((file) => place(file, entry.stem));
        return [
          {
            kind: 'group',
            key: `${folder.dir}/${entry.stem}`,
            stem: entry.stem,
            rows: members,
            summary: summarize(members, compare),
            open: query !== '' || members.some((row) => row.open),
          },
        ];
      });
      const all = entries.flatMap((entry) =>
        entry.kind === 'file' ? [entry.row] : entry.rows
      );
      return { dir: folder.dir, entries, summary: summarize(all, compare) };
    });
  });

  /** "24 files", or "3 of 24 files" while the box filters. */
  protected readonly countLabel = computed(() => {
    const total = this.rows().size;
    const shown = this.tree().reduce(
      (sum, folder) =>
        sum +
        folder.entries.reduce(
          (n, entry) => n + (entry.kind === 'file' ? 1 : entry.rows.length),
          0
        ),
      0
    );
    return shown === total ? files(total) : `${shown} of ${files(total)}`;
  });

  protected setFilter(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.filter.set(target.value);
  }

  protected pickMode(mode: string | null): void {
    if (mode === 'view' || mode === 'compare') this.view.go({ mode });
  }
}
