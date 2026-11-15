import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ApiClient } from '@core/api/api-client';
import { isNotFound } from '@core/api/api-error';
import type { DefectReproduction, ReproductionEvidence } from '@core/api/types';
import { techLine } from '@core/commands/command-error';
import {
  DEFECT_WATCH_ACTOR,
  evidenceView,
  failedRequestLine,
  reproductionView,
  type ReproductionTone,
} from '@domain/defects';
import { Button } from '@ui/button/button';
import { AiuPipe } from '@ui/pipes/aiu.pipe';
import { CLOCK } from '@ui/pipes/clock';
import { RelativePipe } from '@ui/pipes/relative.pipe';
import { Skeleton } from '@ui/skeleton/skeleton';

/** The tag classes of a reproduction's verdict: the accent for one that reproduced, an outline for no clear answer. */
export function reproductionTagClass(tone: ReproductionTone): string {
  if (tone === 'reproduced') return 'ah-tag ah-tag--accent';
  return tone === 'not_reproduced' ? 'ah-tag' : 'ah-tag ah-tag--outline';
}

/** What the detail holds of one screenshot or recording: being read, its object URL, or why it does not show. */
type FileState =
  | { readonly kind: 'reading' }
  | { readonly kind: 'ready'; readonly url: string }
  | { readonly kind: 'gone' }
  | { readonly kind: 'failed'; readonly tech: string };

/**
 * The detail row of a defect's latest reproduction (`ahoy-hosted` design §5 "Defect reproduction"): the verdict and
 * why, the steps the agent took and what it saw after each, what the browser reported, the screenshots it took and,
 * when the defect was reproduced, the recording of the browser. The screenshots are read when the row opens; a
 * recording, which may be large, when the person asks for it. Their bytes show through object URLs, revoked when the
 * row closes. Everything the agent wrote is untrusted text and shows as text.
 */
@Component({
  selector: 'ah-reproduction-details',
  imports: [AiuPipe, Button, RelativePipe, Skeleton],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
      padding: 6px 0 10px;
      white-space: normal;
    }
    .reproduction__facts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 24px;
      margin: 0;
    }
    .reproduction__facts dt,
    .reproduction__title {
      margin: 0;
      color: var(--ink-muted);
      font-size: 11px;
      font-weight: 600;
    }
    .reproduction__facts dd {
      margin: 2px 0 0;
      overflow-wrap: anywhere;
    }
    .reproduction__wide {
      flex-basis: 100%;
    }
    .reproduction__section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      padding-top: 12px;
      border-top: 1px solid var(--line-soft);
    }
    .reproduction__steps,
    .reproduction__list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding-left: 20px;
      overflow-wrap: anywhere;
    }
    .reproduction__saw {
      display: block;
      color: var(--ink-muted);
    }
    .reproduction__list {
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .reproduction__shots {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .reproduction__shot {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      min-width: 0;
    }
    .reproduction__frame {
      display: grid;
      place-items: center;
      min-height: 120px;
      padding: 8px;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-md);
      background: var(--surface-sunken);
      text-align: center;
    }
    a.reproduction__frame {
      position: relative;
      padding: 0;
      overflow: hidden;
    }
    .reproduction__frame img {
      display: block;
      width: 100%;
      height: auto;
    }
    .reproduction__recordings {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .reproduction__recordings li {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      min-width: 0;
    }
    .reproduction__recordings video {
      display: block;
      width: 100%;
      max-width: 960px;
      height: auto;
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-md);
      background: var(--surface-sunken);
    }
  `,
  template: `
    <dl class="reproduction__facts">
      <div>
        <dt>Verdict</dt>
        <dd>
          <span [class]="tagClass()">{{ view().label }}</span>
        </dd>
      </div>
      <div>
        <dt>Environment</dt>
        <dd>{{ reproduction().environment }}</dd>
      </div>
      <div>
        <dt>Asked by</dt>
        <dd>{{ askedBy() }} · {{ reproduction().startedAt | ahRelative }}</dd>
      </div>
      <div>
        <dt>Spent</dt>
        <dd>{{ reproduction().nanoAiu | ahAiu: 2 }} AIU</dd>
      </div>
      @if (why(); as text) {
        <div class="reproduction__wide">
          <dt>Why</dt>
          <dd>{{ text }}</dd>
        </div>
      }
      @if (!reproduction().current) {
        <div class="reproduction__wide">
          <dt>The defect changed in Jira since</dt>
          <dd>This is what Ahoy saw for the version before.</dd>
        </div>
      }
    </dl>

    @if (steps().length > 0) {
      <section
        class="reproduction__section"
        [attr.aria-label]="'Steps of the reproduction of ' + defectKey()"
      >
        <h3 class="reproduction__title">Steps</h3>
        <ol class="reproduction__steps">
          @for (step of steps(); track $index) {
            <li>
              {{ step.action }}
              @if (step.saw) {
                <span class="reproduction__saw">Saw: {{ step.saw }}</span>
              }
            </li>
          }
        </ol>
      </section>
    }

    @if (evidence(); as kept) {
      @if (kept.screenshots.length > 0) {
        <section
          class="reproduction__section"
          [attr.aria-label]="
            'Screenshots of the reproduction of ' + defectKey()
          "
        >
          <h3 class="reproduction__title">Screenshots</h3>
          <ul class="reproduction__shots">
            @for (shot of kept.screenshots; track shot.file.id) {
              <li>
                <figure class="reproduction__shot">
                  @let state = fileState(shot.file.id);
                  @switch (state.kind) {
                    @case ('ready') {
                      @if (urlOf(shot.file.id); as url) {
                        <a
                          class="reproduction__frame"
                          [href]="url"
                          target="_blank"
                          rel="noopener"
                        >
                          <img [src]="url" [alt]="shot.label" />
                          <span class="ah-sr">, opens in a new tab</span>
                        </a>
                      }
                    }
                    @case ('reading') {
                      <div
                        class="reproduction__frame"
                        role="status"
                        [attr.aria-label]="'Reading ' + shot.label"
                      >
                        <ah-skeleton width="60%" />
                      </div>
                    }
                    @case ('gone') {
                      <div class="reproduction__frame ah-hint">
                        Ahoy no longer keeps it.
                      </div>
                    }
                    @case ('failed') {
                      <div class="reproduction__frame ah-hint">
                        <span>
                          Could not be read ({{ techOf(shot.file.id) }}).
                          <button
                            ahButton
                            size="sm"
                            type="button"
                            [attr.aria-label]="
                              'Try reading ' + shot.label + ' again'
                            "
                            (click)="read(shot.file)"
                          >
                            Try again
                          </button>
                        </span>
                      </div>
                    }
                  }
                  <figcaption class="ah-hint">{{ shot.label }}</figcaption>
                </figure>
              </li>
            }
          </ul>
        </section>
      }
      @if (kept.recordings.length > 0) {
        <section
          class="reproduction__section"
          [attr.aria-label]="'Recording of the reproduction of ' + defectKey()"
        >
          <h3 class="reproduction__title">
            {{ kept.recordings.length === 1 ? 'Recording' : 'Recordings' }}
          </h3>
          <span class="ah-hint"
            >The browser as Ahoy drove it, without sound. The steps above say
            what it shows.</span
          >
          <ul class="reproduction__recordings">
            @for (recording of kept.recordings; track recording.file.id) {
              <li>
                @let state = fileState(recording.file.id);
                @switch (state.kind) {
                  @case ('ready') {
                    @if (urlOf(recording.file.id); as url) {
                      <video
                        controls
                        preload="metadata"
                        [src]="url"
                        [attr.aria-label]="
                          recording.label +
                          ' of the reproduction of ' +
                          defectKey()
                        "
                      ></video>
                    }
                  }
                  @case ('reading') {
                    <span class="ah-muted" role="status"
                      >Reading {{ recording.label.toLowerCase() }},
                      {{ recording.size }}…</span
                    >
                  }
                  @case ('gone') {
                    <span class="ah-hint">Ahoy no longer keeps it.</span>
                  }
                  @default {
                    @if (techOf(recording.file.id); as tech) {
                      <span class="ah-hint" role="alert"
                        >Could not be read ({{ tech }}).</span
                      >
                    }
                    <button
                      ahButton="soft"
                      size="sm"
                      type="button"
                      (click)="read(recording.file)"
                    >
                      Show {{ recording.label.toLowerCase() }} ·
                      {{ recording.size }}
                    </button>
                  }
                }
                <span class="ah-hint">{{ recording.label }}</span>
              </li>
            }
          </ul>
        </section>
      }
      <span class="ah-hint"
        >Ahoy keeps
        {{
          kept.recordings.length === 0
            ? 'the screenshots'
            : kept.screenshots.length === 0
              ? 'the recording'
              : 'the screenshots and the recording'
        }}
        until {{ kept.keptUntil }}, then removes them.</span
      >
    } @else if (reproduction().result !== null) {
      <span class="ah-hint"
        >No screenshot or recording is kept for this reproduction.</span
      >
    }

    @if (consoleErrors().length > 0 || failedRequests().length > 0) {
      <section
        class="reproduction__section"
        [attr.aria-label]="
          'What the browser reported in the reproduction of ' + defectKey()
        "
      >
        @if (consoleErrors().length > 0) {
          <h3 class="reproduction__title">Console errors</h3>
          <ul class="reproduction__list">
            @for (line of consoleErrors(); track $index) {
              <li>{{ line }}</li>
            }
          </ul>
        }
        @if (failedRequests().length > 0) {
          <h3 class="reproduction__title">Requests that failed</h3>
          <ul class="reproduction__list">
            @for (request of failedRequests(); track $index) {
              <li>{{ requestLine(request) }}</li>
            }
          </ul>
        }
      </section>
    }
  `,
})
export class ReproductionDetails {
  private readonly api = inject(ApiClient);
  private readonly clock = inject(CLOCK);
  /** The object URLs made, to revoke when the row closes. */
  private readonly urls: string[] = [];
  private closed = false;

  /** The defect's Jira key: the evidence is read under it. */
  readonly defectKey = input.required<string>();
  /** The defect's latest reproduction, as the list has it. */
  readonly reproduction = input.required<DefectReproduction>();

  private readonly files = signal<ReadonlyMap<string, FileState>>(new Map());

  protected readonly view = computed(
    () =>
      reproductionView(this.reproduction()) ?? {
        label: '—',
        tone: 'inconclusive' as const,
        detail: '',
      }
  );
  protected readonly tagClass = computed(() =>
    reproductionTagClass(this.view().tone)
  );
  /** Who asked for it: "Ahoy" for the watch, else the person's name or id. */
  protected readonly askedBy = computed(() => {
    const { startedBy, startedByName } = this.reproduction();
    return startedBy === DEFECT_WATCH_ACTOR
      ? 'Ahoy'
      : (startedByName ?? startedBy);
  });
  protected readonly why = computed(
    () => this.reproduction().result?.why.trim() ?? ''
  );
  protected readonly steps = computed(
    () => this.reproduction().result?.steps ?? []
  );
  protected readonly consoleErrors = computed(
    () => this.reproduction().result?.consoleErrors ?? []
  );
  protected readonly failedRequests = computed(
    () => this.reproduction().result?.failedRequests ?? []
  );
  /** The screenshots and recordings by name, with the day they go; null when none is kept. */
  protected readonly evidence = computed(() =>
    evidenceView(this.reproduction().evidence, this.clock())
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.closed = true;
      for (const url of this.urls) URL.revokeObjectURL(url);
    });
    // The screenshots show as soon as the row opens; one already read, or being read, is not read again when the
    // list is refreshed under the row.
    effect(() => {
      const shots = this.evidence()?.screenshots ?? [];
      untracked(() => {
        for (const shot of shots)
          if (!this.files().has(shot.file.id)) void this.read(shot.file);
      });
    });
  }

  /** What the row holds of a file; one never asked for is `idle`. */
  protected fileState(id: string): FileState | { readonly kind: 'idle' } {
    return this.files().get(id) ?? { kind: 'idle' };
  }

  /** The object URL of a file that was read, or null. */
  protected urlOf(id: string): string | null {
    const state = this.files().get(id);
    return state?.kind === 'ready' ? state.url : null;
  }

  /** Why a file could not be read, as the technical line, or null. */
  protected techOf(id: string): string | null {
    const state = this.files().get(id);
    return state?.kind === 'failed' ? state.tech : null;
  }

  protected requestLine(
    request: NonNullable<DefectReproduction['result']>['failedRequests'][number]
  ): string {
    return failedRequestLine(request);
  }

  /** Reads a screenshot's or a recording's bytes, once at a time, and shows them through an object URL. */
  protected async read(file: ReproductionEvidence): Promise<void> {
    if (this.files().get(file.id)?.kind === 'reading') return;
    this.set(file.id, { kind: 'reading' });
    const result = await this.api.getDefectEvidence(this.defectKey(), file);
    if (this.closed) return;
    if (!result.ok) {
      this.set(
        file.id,
        isNotFound(result.error)
          ? { kind: 'gone' }
          : { kind: 'failed', tech: techLine(result.error) }
      );
      return;
    }
    const url = URL.createObjectURL(result.value);
    this.urls.push(url);
    this.set(file.id, { kind: 'ready', url });
  }

  private set(id: string, state: FileState): void {
    const files = new Map(this.files());
    files.set(id, state);
    this.files.set(files);
  }
}
