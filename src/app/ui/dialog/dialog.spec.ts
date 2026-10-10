import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import type { ComponentFixture } from '@angular/core/testing';
import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { DialogError, DialogKind } from './dialog';
import { DialogService, DialogShell } from './dialog';

/** What the example dialog is opened with. */
interface ExampleData {
  readonly kind: DialogKind;
  readonly withField: boolean;
}

/** A concrete dialog as a feature lane would write one: it owns the form, the request and the result. */
@Component({
  imports: [DialogShell, ReactiveFormsModule],
  template: `
    <ah-dialog
      heading="Resume PROJ-118?"
      [kind]="data.kind"
      confirmLabel="Resume · up to 10.2 AIU"
      [busy]="busy()"
      [error]="error()"
      (confirm)="onConfirm()"
    >
      <span ahDialogLead>Ahoy retries <b>planning</b> with Cartographer.</span>
      @if (data.withField) {
        <label for="reason">Reason</label>
        <textarea id="reason" [formControl]="reason"></textarea>
      }
    </ah-dialog>
  `,
})
class ExampleDialog {
  readonly data = inject<ExampleData>(DIALOG_DATA);
  readonly ref = inject<DialogRef<string, ExampleDialog>>(DialogRef);
  readonly reason = new FormControl('Switched planning.', {
    nonNullable: true,
  });
  readonly busy = signal(false);
  readonly error = signal<DialogError | null>(null);
  confirms = 0;

  onConfirm(): void {
    this.confirms += 1;
    this.busy.set(true);
  }

  finish(): void {
    this.busy.set(false);
    this.ref.close(`resumed: ${this.reason.value}`);
  }
}

/** The page that opens the dialog from a button, so focus has somewhere to return. */
@Component({
  template: `<button id="opener" type="button" (click)="open()">
    Resume
  </button>`,
})
class Page {
  private readonly dialogs = inject(DialogService);
  ref: DialogRef<string, ExampleDialog> | null = null;
  results: (string | undefined)[] = [];
  data: ExampleData = { kind: 'default', withField: true };

  open(): void {
    this.ref = this.dialogs.open<string, ExampleData, ExampleDialog>(
      ExampleDialog,
      { data: this.data }
    );
    this.ref.closed.subscribe((r) => this.results.push(r));
  }
}

let fixture: ComponentFixture<Page>;

async function settle(): Promise<void> {
  await fixture.whenStable();
  TestBed.tick();
  await fixture.whenStable();
}

async function openDialog(
  data?: ExampleData
): Promise<{ page: Page; dialog: ExampleDialog; container: HTMLElement }> {
  fixture = TestBed.createComponent(Page);
  document.body.appendChild(fixture.nativeElement as HTMLElement);
  const page = fixture.componentInstance;
  if (data) page.data = data;
  await settle();
  const opener = (
    fixture.nativeElement as HTMLElement
  ).querySelector<HTMLButtonElement>('#opener')!;
  opener.focus();
  opener.click();
  await settle();
  const container = document.querySelector<HTMLElement>(
    '.cdk-dialog-container'
  )!;
  return { page, dialog: page.ref!.componentInstance!, container };
}

function pressEscape(target: Element): void {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'keyCode', { get: () => 27 });
  target.dispatchEvent(event);
}

function buttons(container: HTMLElement): {
  close: HTMLButtonElement;
  cancel: HTMLButtonElement;
  ok: HTMLButtonElement;
} {
  const [cancel, ok] = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.ah-dialog__foot button')
  );
  return {
    close: container.querySelector('.ah-dialog__close')!,
    cancel: cancel!,
    ok: ok!,
  };
}

describe('ah-dialog on the CDK dialog', () => {
  afterEach(() => {
    fixture?.destroy();
    (fixture?.nativeElement as HTMLElement | undefined)?.remove();
  });

  it('opens a modal dialog labelled by its title, with the lead text first in the body', async () => {
    const { container } = await openDialog();
    expect(container.getAttribute('role')).toBe('dialog');
    expect(container.getAttribute('aria-modal')).toBe('true');
    const title = container.querySelector('h2.ah-dialog__title')!;
    expect(title.textContent).toBe('Resume PROJ-118?');
    expect(container.getAttribute('aria-labelledby')).toBe(title.id);
    const frame = container.querySelector('.ah-dialog')!;
    expect(frame.getAttribute('role')).toBeNull();
    expect(frame.classList.contains('ah')).toBe(true);
    expect(
      container.querySelector('.ah-dialog__body')!.firstElementChild!
        .textContent
    ).toContain('Ahoy retries');
    expect(
      container.querySelector('.ah-dialog__close')!.getAttribute('aria-label')
    ).toBe('Close');
  });

  it('puts the focus on the first field, not on the close button', async () => {
    const { container } = await openDialog();
    expect(document.activeElement).toBe(container.querySelector('textarea'));
  });

  it('focuses the dialog itself when it has no field', async () => {
    const { container } = await openDialog({
      kind: 'default',
      withField: false,
    });
    expect(document.activeElement).toBe(container);
  });

  it('closes on Escape without a result or a confirm, and gives the focus back to the opener', async () => {
    const { page, dialog, container } = await openDialog();
    pressEscape(container.querySelector('textarea')!);
    await settle();
    expect(page.results).toEqual([undefined]);
    expect(dialog.confirms).toBe(0);
    expect(document.querySelector('.cdk-dialog-container')).toBeNull();
    expect(document.activeElement!.id).toBe('opener');
  });

  it('closes on Cancel and on the close button without a result', async () => {
    const first = await openDialog();
    buttons(first.container).cancel.click();
    await settle();
    expect(first.page.results).toEqual([undefined]);
    expect(first.dialog.confirms).toBe(0);
    fixture.destroy();

    const second = await openDialog();
    buttons(second.container).close.click();
    await settle();
    expect(second.page.results).toEqual([undefined]);
    expect(document.activeElement!.id).toBe('opener');
  });

  it('returns the result the concrete dialog closes with', async () => {
    const { page, dialog, container } = await openDialog();
    buttons(container).ok.click();
    await settle();
    expect(dialog.confirms).toBe(1);
    dialog.finish();
    await settle();
    expect(page.results).toEqual(['resumed: Switched planning.']);
    expect(document.activeElement!.id).toBe('opener');
  });

  it('while busy, ignores a second confirm, Escape, Cancel and the close button', async () => {
    const { page, dialog, container } = await openDialog();
    const { ok, cancel, close } = buttons(container);
    ok.click();
    await settle();
    expect(dialog.busy()).toBe(true);
    ok.click();
    ok.click();
    pressEscape(ok);
    cancel.click();
    close.click();
    await settle();
    expect(dialog.confirms).toBe(1);
    expect(page.results).toEqual([]);
    expect(document.querySelector('.cdk-dialog-container')).not.toBeNull();
    expect(ok.getAttribute('aria-disabled')).toBe('true');
    expect(cancel.getAttribute('aria-disabled')).toBe('true');
    expect(ok.textContent!.trim()).toBe('Sending…');
    expect(
      container.querySelector('.ah-dialog')!.getAttribute('aria-busy')
    ).toBe('true');
    expect(container.querySelector('[role="status"]')!.textContent).toBe(
      'Sending…'
    );

    dialog.busy.set(false);
    await settle();
    expect(ok.getAttribute('aria-disabled')).toBeNull();
    pressEscape(ok);
    await settle();
    expect(page.results).toEqual([undefined]);
  });

  it('shows an error at the top of the body, stays open and keeps the typed text', async () => {
    const { page, dialog, container } = await openDialog();
    const textarea = container.querySelector('textarea')!;
    textarea.value = 'My edited reason';
    textarea.dispatchEvent(new Event('input'));
    buttons(container).ok.click();
    await settle();
    dialog.busy.set(false);
    dialog.error.set({
      variant: 'notice',
      heading: 'This voyage changed since you opened it',
      text: 'We kept your text; check it and send again.',
    });
    await settle();
    const body = container.querySelector('.ah-dialog__body')!;
    const banner = body.firstElementChild!.querySelector('.ah-banner')!;
    expect(banner.className).toBe('ah-banner ah-banner--notice');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toContain(
      'This voyage changed since you opened it'
    );
    expect(container.querySelector('textarea')!.value).toBe('My edited reason');
    expect(dialog.reason.value).toBe('My edited reason');
    expect(page.results).toEqual([]);
  });

  it.each([
    ['default', 'ah-dialog__icon', 'info', 'ah-btn ah-btn--primary'],
    [
      'danger',
      'ah-dialog__icon ah-dialog__icon--danger',
      'anchor',
      'ah-btn ah-btn--danger',
    ],
    [
      'sendback',
      'ah-dialog__icon ah-dialog__icon--sendback',
      'send-back',
      'ah-btn ah-btn--primary',
    ],
  ] as const)(
    'kind %s: tile %s, icon %s, confirm %s',
    async (kind, tile, icon, confirm) => {
      const { container } = await openDialog({ kind, withField: true });
      const tileEl = container.querySelector('.ah-dialog__icon')!;
      expect(
        tileEl.className
          .split(' ')
          .filter((c) => c.startsWith('ah-'))
          .join(' ')
      ).toBe(tile);
      expect(tileEl.querySelector('svg')!.getAttribute('data-icon')).toBe(icon);
      expect(buttons(container).ok.className).toBe(confirm);
    }
  );
});

@Component({
  imports: [DialogShell],
  template: `
    <ah-dialog
      heading="Models per phase"
      icon="wheel"
      confirmLabel="Save models"
      [confirmDisabled]="invalid()"
      (confirm)="confirms = confirms + 1"
      (dismissed)="dismissals = dismissals + 1"
    >
      <span ahDialogCost class="cost">cost</span>
      <span ahDialogLead class="lead">lead</span>
      <span class="field">field</span>
    </ah-dialog>
  `,
})
class InlineHost {
  readonly invalid = signal(true);
  confirms = 0;
  dismissals = 0;
}

describe('ah-dialog inline (gallery, no CDK)', () => {
  it('is its own labelled dialog, orders the body slots and honours confirmDisabled', async () => {
    const f = TestBed.createComponent(InlineHost);
    await f.whenStable();
    const root = f.nativeElement as HTMLElement;
    const frame = root.querySelector('.ah-dialog')!;
    expect(frame.getAttribute('role')).toBe('dialog');
    expect(frame.getAttribute('aria-labelledby')).toBe(
      root.querySelector('h2')!.id
    );
    expect(
      root.querySelector('.ah-dialog__icon svg')!.getAttribute('data-icon')
    ).toBe('wheel');
    expect(
      Array.from(root.querySelector('.ah-dialog__body')!.children).map(
        (c) => c.className
      )
    ).toEqual(['lead', 'cost', 'field']);
    const [cancel, ok] = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.ah-dialog__foot button')
    );
    expect(cancel!.textContent!.trim()).toBe('Cancel');
    expect(ok!.disabled).toBe(true);
    ok!.click();
    expect(f.componentInstance.confirms).toBe(0);
    f.componentInstance.invalid.set(false);
    await f.whenStable();
    ok!.click();
    cancel!.click();
    expect(f.componentInstance.confirms).toBe(1);
    expect(f.componentInstance.dismissals).toBe(1);
  });
});
