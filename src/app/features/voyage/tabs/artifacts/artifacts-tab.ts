import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
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
import { statusLabel } from './file-compare';

const VIEW_ONLY: readonly SectionTab[] = [{ id: 'view', label: 'View' }];
const VIEW_OR_COMPARE: readonly SectionTab[] = [
  { id: 'view', label: 'View' },
  { id: 'compare', label: 'Compare' },
];

/** One row of the file list. */
interface FileRow {
  readonly path: string;
  readonly meta: string;
  readonly status: string;
  readonly open: boolean;
  /** The query of the link on the file's name: the same mode, this file. */
  readonly link: Record<string, string>;
  readonly view: Record<string, string>;
  readonly compare: Record<string, string> | null;
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
                @for (row of rows(); track row.path) {
                  <div
                    class="artifacts__file"
                    [class.artifacts__file--open]="row.open"
                  >
                    <a
                      class="artifacts__name"
                      [routerLink]="[]"
                      [queryParams]="row.link"
                      [attr.aria-current]="row.open ? 'true' : null"
                    >
                      <span class="ah-mono artifacts__path">{{
                        row.path
                      }}</span>
                      @if (row.status !== '') {
                        <small class="artifacts__status">{{
                          row.status
                        }}</small>
                      }
                    </a>
                    <span class="artifacts__meta">
                      <span class="ah-hint">{{ row.meta }}</span>
                      <a
                        class="artifacts__link"
                        [routerLink]="[]"
                        [queryParams]="row.view"
                        [attr.aria-label]="'View ' + row.path"
                        >View</a
                      >
                      @if (row.compare; as params) {
                        <a
                          class="artifacts__link"
                          [routerLink]="[]"
                          [queryParams]="params"
                          [attr.aria-label]="'Compare ' + row.path"
                          >Compare</a
                        >
                      }
                    </span>
                  </div>
                }
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

  protected readonly rows = computed<readonly FileRow[]>(() => {
    const selection = this.selection();
    const compare = selection.mode === 'compare';
    const changes = this.view.changes();
    const sizesKnown = selection.target === this.view.current();
    const items = new Map(this.view.items().map((item) => [item.path, item]));
    return this.view
      .paths()
      .filter((path) => !compare || changes.get(path)?.kind !== 'missing')
      .map((path) => {
        const item = items.get(path);
        const kind = this.view.kindOf(path);
        const type = kindLabel(kind);
        return {
          path,
          meta:
            item !== undefined && sizesKnown
              ? `${type} · ${formatSize(item.sizeBytes)}`
              : type,
          status: compare ? statusLabel(changes.get(path), kind) : '',
          open: path === selection.path,
          link: this.view.queryFor({ path }),
          view: this.view.queryFor({ path, mode: 'view' }),
          compare:
            selection.base === null
              ? null
              : this.view.queryFor({ path, mode: 'compare' }),
        };
      });
  });

  protected pickMode(mode: string | null): void {
    if (mode === 'view' || mode === 'compare') this.view.go({ mode });
  }
}
