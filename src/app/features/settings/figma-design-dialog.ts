import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import type { ApiError } from '@core/api/api-error';
import type { FigmaSettings, FigmaSettingsChange } from '@core/api/types';
import {
  MAX_SELECTOR_PREFIX_CHARS,
  MAX_UI_AGENTS,
  selectorPrefixProblem,
} from '@domain/figma-settings';
import { Banner } from '@ui/banner/banner';
import { DialogShell } from '@ui/dialog/dialog';
import { Field, FieldControl } from '@ui/field/field';
import { Skeleton } from '@ui/skeleton/skeleton';
import { ToastService } from '@ui/toast/toast';
import type { FigmaSettingsStore } from './figma-settings-store';
import { DialogSend } from './jira-dialog-send';
import { settingsErrorView } from './settings-errors';

/** What the design phase dialog is opened with: the page's store and Figma's settings as they are. */
export interface FigmaDesignData {
  readonly store: FigmaSettingsStore;
  readonly figma: FigmaSettings;
}

/** The content repository's profiles as the dialog read them, or why it could not. */
type ProfilesState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'read'; readonly names: readonly string[] }
  | { readonly kind: 'failed'; readonly why: string };

/**
 * Changes how a story's design reaches the agents that build its UI: which implementer profiles get it (chosen from
 * the content repository's profiles at HEAD) and the design kit's selector prefix. Closes with true once saved.
 */
@Component({
  selector: 'ah-figma-design-dialog',
  imports: [Banner, DialogShell, Field, FieldControl, Skeleton],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    legend {
      padding: 0;
      margin-bottom: 4px;
      font-weight: 600;
    }
    .choice {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .list {
      max-height: 220px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
  `,
  template: `
    <ah-dialog
      icon="compass"
      heading="Design phase"
      subtitle="How a story's design reaches the agents that build its UI"
      confirmLabel="Save"
      busyLabel="Saving…"
      [busy]="send.busy()"
      [confirmDisabled]="invalid()"
      [error]="send.error()"
      (confirm)="submit()"
    >
      <form (submit)="$event.preventDefault(); submit()">
        <fieldset>
          <legend>UI builders</legend>
          @switch (profiles().kind) {
            @case ('loading') {
              <ah-skeleton width="60%" />
            }
            @case ('failed') {
              <ah-banner
                variant="notice"
                heading="The profiles can't be listed"
              >
                {{ profilesWhy() }} The UI builders stay as they are; the prefix
                can still change.
              </ah-banner>
            }
            @default {
              <div class="list">
                @for (name of choices(); track name) {
                  <label class="choice">
                    <input
                      type="checkbox"
                      [checked]="chosen().includes(name)"
                      (change)="toggle(name, $event)"
                    />
                    <span class="ah-mono">{{ name }}</span>
                  </label>
                }
              </div>
              <span class="ah-hint"
                >The implementer agents that get the design: profiles from the
                content repository. At least one, at most {{ maxAgents }}.</span
              >
            }
          }
        </fieldset>
        <ah-field
          label="Design kit prefix"
          required
          hint="Components whose selector starts with it are the kit's; the agent asks before building its own."
          [errorText]="prefixError() ?? ''"
        >
          <input
            ahInput
            mono
            type="text"
            autocomplete="off"
            spellcheck="false"
            [attr.maxlength]="maxPrefix"
            [value]="prefix()"
            (input)="typePrefix($event)"
          />
        </ah-field>
      </form>
    </ah-dialog>
  `,
})
export class FigmaDesignDialog {
  private readonly data = inject<FigmaDesignData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly send = new DialogSend(this.ref, inject(ToastService));
  protected readonly maxAgents = MAX_UI_AGENTS;
  protected readonly maxPrefix = MAX_SELECTOR_PREFIX_CHARS;

  protected readonly profiles = signal<ProfilesState>({ kind: 'loading' });
  protected readonly chosen = signal<readonly string[]>(
    this.data.figma.uiAgents
  );
  protected readonly prefix = signal(this.data.figma.selectorPrefix);
  protected readonly prefixError = computed(() =>
    selectorPrefixProblem(this.prefix())
  );
  /** The profiles to choose from: those at HEAD, with any saved one HEAD no longer has. */
  protected readonly choices = computed(() => {
    const state = this.profiles();
    const names = state.kind === 'read' ? state.names : [];
    return [
      ...names,
      ...this.data.figma.uiAgents.filter((a) => !names.includes(a)),
    ];
  });
  protected readonly profilesWhy = computed(() => {
    const state = this.profiles();
    return state.kind === 'failed' ? state.why : '';
  });
  protected readonly invalid = computed(
    () =>
      this.prefixError() !== null ||
      this.chosen().length === 0 ||
      this.chosen().length > MAX_UI_AGENTS
  );

  constructor() {
    void this.readProfiles();
  }

  private async readProfiles(): Promise<void> {
    const result = await this.data.store.profiles();
    if (!result.ok) {
      this.profiles.set({ kind: 'failed', why: this.readError(result.error) });
      return;
    }
    const { names, problem } = result.value.profiles;
    this.profiles.set(
      problem === null
        ? { kind: 'read', names }
        : {
            kind: 'failed',
            why: `The content repository can't be read (${problem}).`,
          }
    );
  }

  private readError(error: ApiError): string {
    const view = settingsErrorView(error, 'read');
    return view.text ?? view.heading;
  }

  protected toggle(name: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const others = this.chosen().filter((a) => a !== name);
    this.chosen.set(target.checked ? [...others, name] : others);
  }

  protected typePrefix(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.prefix.set(target.value);
  }

  /** Saves what changed and closes; nothing changed closes without a request. */
  async submit(): Promise<void> {
    if (this.invalid() || this.send.busy()) return;
    const figma = this.data.figma;
    const prefix = this.prefix().trim();
    const agents = this.chosen();
    const agentsChanged =
      this.profiles().kind === 'read' &&
      (agents.length !== figma.uiAgents.length ||
        agents.some((a) => !figma.uiAgents.includes(a)));
    const prefixChanged = prefix !== figma.selectorPrefix;
    if (!agentsChanged && !prefixChanged) {
      this.ref.close(false);
      return;
    }
    const body: FigmaSettingsChange = {
      ...(figma.version !== null ? { version: figma.version } : {}),
      ...(agentsChanged ? { uiAgents: [...agents] } : {}),
      ...(prefixChanged ? { selectorPrefix: prefix } : {}),
    };
    await this.send.run(
      () => this.data.store.change(body),
      'Design phase settings saved.'
    );
  }
}
