import type { DialogConfig } from '@angular/cdk/dialog';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import type { ComponentType } from '@angular/cdk/overlay';
import {
  Component,
  ElementRef,
  Injectable,
  InjectionToken,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { Banner } from '@ui/banner/banner';
import { Button } from '@ui/button/button';
import { Icon } from '@ui/icon/icon';
import type { IconName } from '@ui/icon/icons';

/** Dialog kinds: the icon tile's colour; `danger` also makes the confirm button `ah-btn--danger`. */
export const DIALOG_KINDS = ['default', 'danger', 'sendback'] as const;

/** A dialog kind. */
export type DialogKind = (typeof DIALOG_KINDS)[number];

/** What the dialog's error region shows: a `notice` for a 409 (changed meanwhile), an `error` otherwise. */
export interface DialogError {
  readonly variant: 'notice' | 'error';
  readonly heading: string;
  readonly text?: string;
  /** The technical line (`status · code · request id`). */
  readonly tech?: string;
}

/** The icon each kind shows unless told otherwise. */
const DEFAULT_ICONS: Readonly<Record<DialogKind, IconName>> = {
  default: 'info',
  danger: 'anchor',
  sendback: 'send-back',
};

/** The elements that take the initial focus, in this order of preference within the body. */
const FIRST_FIELD =
  '[cdkFocusInitial], input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled)';

/** The title id a dialog opened by `DialogService` must use, so the CDK container is labelled by it. */
export const DIALOG_TITLE_ID = new InjectionToken<string>('DIALOG_TITLE_ID');

let nextDialogId = 0;

/**
 * The dialog frame of the design system (`ah-dialog`): icon tile, title, close button, body, footer with Cancel and
 * one confirm button. It has no business logic: a concrete dialog (stop, resume, budget…) uses it as its template,
 * owns the form and the request, and closes its `DialogRef` with the result.
 *
 * - The body shows, in order: the error region, `[ahDialogLead]` (what will happen), `[ahDialogCost]` (an
 *   `<ah-banner variant="cost">`), then everything else (the fields).
 * - Esc, the close button and Cancel close the dialog with no result. While `busy`, they are disabled, Esc and the
 *   backdrop don't close it, and `confirm` is not emitted again: a slow request can't be sent twice.
 * - Opened by `DialogService`, the focus starts on the first field (else on the dialog) and returns to the element
 *   that opened it.
 *
 * ```html
 * <ah-dialog heading="Weigh anchor and resume?" icon="sail" confirmLabel="Resume · up to 10.2 AIU"
 *            [busy]="busy()" [error]="error()" (confirm)="resume()">
 *   <span ahDialogLead>Ahoy retries <b>planning</b> with Cartographer.</span>
 *   <ah-banner ahDialogCost variant="cost" heading="This may spend up to 10.2 AIU">Billed to sam&#64;example.com.</ah-banner>
 *   <ah-field label="Reason" optional><textarea ahInput [formControl]="reason"></textarea></ah-field>
 * </ah-dialog>
 * ```
 */
@Component({
  selector: 'ah-dialog',
  imports: [Banner, Button, Icon],
  // The send-back tile isn't in the bundle (tokens.json documents status-sendback-* for it). position: relative keeps
  // the bundle's absolutely positioned .ah-sr inside the dialog.
  styles: `
    :host {
      display: contents;
    }
    .ah-dialog {
      position: relative;
    }
    .ah-dialog__icon--sendback {
      background: var(--status-sendback-bg);
      color: var(--status-sendback-fg);
    }
  `,
  template: `
    <div
      class="ah ah-dialog"
      [attr.role]="inOverlay ? null : 'dialog'"
      [attr.aria-labelledby]="inOverlay ? null : titleId"
      [attr.aria-busy]="busy() ? 'true' : null"
    >
      <div class="ah-dialog__head">
        <span
          class="ah-dialog__icon"
          [class.ah-dialog__icon--danger]="kind() === 'danger'"
          [class.ah-dialog__icon--sendback]="kind() === 'sendback'"
          ><ah-icon [name]="iconName()" [size]="18"
        /></span>
        <h2 class="ah-dialog__title" [id]="titleId">{{ heading() }}</h2>
        <button
          class="ah-dialog__close"
          type="button"
          aria-label="Close"
          [attr.aria-disabled]="busy() ? 'true' : null"
          (click)="dismiss()"
        >
          <ah-icon name="close" />
        </button>
      </div>
      <div class="ah-dialog__body">
        @if (error(); as e) {
          <ah-banner
            [variant]="e.variant"
            [heading]="e.heading"
            [tech]="e.tech ?? ''"
            announce="alert"
            >{{ e.text ?? '' }}</ah-banner
          >
        }
        <ng-content select="[ahDialogLead]" />
        <ng-content select="[ahDialogCost]" />
        <ng-content />
      </div>
      <div class="ah-dialog__foot">
        <button
          type="button"
          ahButton
          [attr.aria-disabled]="busy() ? 'true' : null"
          (click)="dismiss()"
        >
          {{ cancelLabel() }}
        </button>
        <button
          type="button"
          [ahButton]="kind() === 'danger' ? 'danger' : 'primary'"
          [disabled]="confirmDisabled()"
          [attr.aria-disabled]="busy() ? 'true' : null"
          (click)="onConfirm()"
        >
          {{ busy() ? busyLabel() : confirmLabel() }}
        </button>
      </div>
      @if (busy()) {
        <span class="ah-sr" role="status">{{ busyLabel() }}</span>
      }
    </div>
  `,
})
export class DialogShell {
  /** The title: asks or states the action ("Weigh anchor and resume?"). */
  readonly heading = input.required<string>();
  /** The icon tile's colour, and a `danger` confirm for destructive actions. */
  readonly kind = input<DialogKind>('default');
  /** Another icon than the kind's own (`sail` for resume, `wheel` for models, `aground` for reject). */
  readonly icon = input<IconName | undefined>(undefined);
  /** The confirm button's label: repeats the action, with the amount when it spends ("Resume · up to 10.2 AIU"). */
  readonly confirmLabel = input.required<string>();
  /** The cancel button's label. */
  readonly cancelLabel = input('Cancel');
  /** The confirm label while the request is in flight. */
  readonly busyLabel = input('Sending…');
  /** A request is in flight: nothing closes or confirms until it is done. */
  readonly busy = input(false, { transform: booleanAttribute });
  /** The confirm button is disabled (the form is invalid). */
  readonly confirmDisabled = input(false, { transform: booleanAttribute });
  /** The error to show at the top of the body; the dialog stays open and keeps its fields. */
  readonly error = input<DialogError | null>(null);

  /** The person confirmed; the concrete dialog sends its request and closes its `DialogRef` with the result. */
  readonly confirm = output();
  /** The person cancelled or closed the dialog (it is already closing when opened by `DialogService`). */
  readonly dismissed = output();

  private readonly dialogRef = inject(DialogRef, { optional: true });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** True inside a CDK dialog, whose container already has `role="dialog"` and `aria-labelledby`. */
  protected readonly inOverlay = this.dialogRef !== null;
  protected readonly titleId =
    inject(DIALOG_TITLE_ID, { optional: true }) ??
    `ah-dialog-${nextDialogId++}-title`;
  protected readonly iconName = computed(
    () => this.icon() ?? DEFAULT_ICONS[this.kind()]
  );

  constructor() {
    const ref = this.dialogRef;
    if (ref !== null) {
      const configured = ref.disableClose === true;
      effect(() => {
        ref.disableClose = configured || this.busy();
      });
      // Registered before the CDK container's own initial focus, which keeps a focus that is already inside.
      afterNextRender(() => {
        const field = this.host.nativeElement.querySelector<HTMLElement>(
          `.ah-dialog__body :is(${FIRST_FIELD})`
        );
        field?.focus();
      });
    }
  }

  protected onConfirm(): void {
    if (this.busy() || this.confirmDisabled()) return;
    this.confirm.emit();
  }

  protected dismiss(): void {
    if (this.busy()) return;
    this.dismissed.emit();
    this.dialogRef?.close();
  }
}

/** Options for `DialogService.open`. */
export interface OpenDialogOptions<D> {
  /** Passed to the dialog component as `DIALOG_DATA`. */
  readonly data?: D;
  /** The dialog's width; 480px by default, never wider than the window less 16px on each side. */
  readonly width?: string;
}

/**
 * Opens a dialog component (one whose template is an `ah-dialog`) on the CDK `Dialog`, modal, labelled by its title,
 * with the focus on its first field and returned to the opener on close. The `DialogRef`'s `closed` emits the result
 * the component closed it with, or `undefined` when it was cancelled.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(Dialog);

  /** Opens `component` and returns its `DialogRef`. */
  open<R, D = unknown, C = unknown>(
    component: ComponentType<C>,
    options: OpenDialogOptions<D> = {}
  ): DialogRef<R, C> {
    const titleId = `ah-dialog-${nextDialogId++}-title`;
    const config: DialogConfig<D, DialogRef<R, C>> = {
      ...(options.data !== undefined ? { data: options.data } : {}),
      ariaLabelledBy: titleId,
      ariaModal: true,
      autoFocus: 'dialog',
      restoreFocus: true,
      hasBackdrop: true,
      width: options.width ?? '480px',
      maxWidth: 'calc(100vw - 32px)',
      providers: [{ provide: DIALOG_TITLE_ID, useValue: titleId }],
    };
    return this.dialog.open<R, D, C>(component, config);
  }
}
