import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, DOCUMENT, inject } from '@angular/core';
import type { MeetingNoteImage } from '@core/api/types';
import { DialogShell } from '@ui/dialog/dialog';
import type { MeetingsStore } from './meetings-store';

/** What the image viewer is opened with: the page's store (which holds the image once read), the image and a title. */
export interface ImageViewerData {
  readonly store: MeetingsStore;
  readonly image: MeetingNoteImage;
  readonly heading: string;
}

const EXTENSIONS: Readonly<Record<MeetingNoteImage['mediaType'], string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** A note's image at its size, up to the window's; Download saves it. */
@Component({
  selector: 'ah-image-viewer-dialog',
  imports: [DialogShell],
  styles: `
    .frame {
      display: grid;
      place-items: center;
      min-height: 120px;
    }
    img {
      max-width: 100%;
      max-height: calc(100dvh - 220px);
      object-fit: contain;
    }
  `,
  template: `
    <ah-dialog
      [heading]="data.heading"
      cancelLabel="Close"
      confirmLabel="Download"
      [confirmDisabled]="url() === null"
      (confirm)="download()"
    >
      <div class="frame">
        @if (url(); as u) {
          <img [src]="u" [alt]="data.heading" />
        } @else {
          <span class="ah-hint">The image could not be read.</span>
        }
      </div>
    </ah-dialog>
  `,
})
export class ImageViewerDialog {
  protected readonly data = inject<ImageViewerData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly document = inject(DOCUMENT);

  protected readonly url = computed(
    () => this.data.store.imageUrls().get(this.data.image.id) ?? null
  );

  /** Saves the image as `image-<id>.<ext>` and closes. */
  protected download(): void {
    const url = this.url();
    if (url === null) return;
    const link = this.document.createElement('a');
    link.href = url;
    link.download = `image-${this.data.image.id}.${EXTENSIONS[this.data.image.mediaType]}`;
    link.rel = 'noopener';
    this.document.body.append(link);
    link.click();
    link.remove();
    this.ref.close();
  }
}
