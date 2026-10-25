import { Component, effect, inject, input } from '@angular/core';
import type { MeetingNote, MeetingNoteImage } from '@core/api/types';
import { Button } from '@ui/button/button';
import { DialogService } from '@ui/dialog/dialog';
import { ImageViewerDialog, type ImageViewerData } from './image-viewer-dialog';
import { MeetingsStore } from './meetings-store';

/**
 * A note's images as thumbnails under its text, oldest first. Each is read once (the API needs the token, so an `<img>`
 * cannot fetch it itself) and opens large on click; while the note can change, each can be removed.
 */
@Component({
  selector: 'ah-note-images',
  imports: [Button],
  styles: `
    :host {
      display: block;
    }
    ul {
      list-style: none;
      margin: 6px 0 2px;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    li {
      position: relative;
    }
    .thumb {
      display: grid;
      place-items: center;
      width: 96px;
      height: 72px;
      padding: 0;
      overflow: hidden;
      background: var(--surface-raised);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      cursor: zoom-in;
    }
    .thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .remove-image {
      position: absolute;
      top: 2px;
      right: 2px;
      opacity: 0;
    }
    li:hover .remove-image,
    li:focus-within .remove-image {
      opacity: 1;
    }
  `,
  template: `
    @let n = note();
    <ul [attr.aria-label]="'Images of the note: ' + n.text">
      @for (image of n.images; track image.id; let i = $index) {
        <li>
          <button
            type="button"
            class="thumb"
            [attr.aria-label]="label(i)"
            (click)="open(image, i)"
          >
            @if (urls().get(image.id); as url) {
              <img [src]="url" alt="" />
            } @else {
              <span class="ah-hint">Image</span>
            }
          </button>
          @if (editable()) {
            <button
              ahButton="ghost"
              size="sm"
              type="button"
              class="remove-image"
              [attr.aria-label]="'Remove ' + label(i).toLowerCase()"
              [disabled]="store.busy()"
              (click)="store.deleteNoteImage(n.id, image.id)"
            >
              ×
            </button>
          }
        </li>
      }
    </ul>
  `,
})
export class NoteImages {
  protected readonly store = inject(MeetingsStore);
  private readonly dialogs = inject(DialogService);

  /** The note, with its images. */
  readonly note = input.required<MeetingNote>();
  /** Whether the note can change, so its images can be removed. */
  readonly editable = input(false);

  protected readonly urls = this.store.imageUrls;

  constructor() {
    effect(() => {
      for (const image of this.note().images)
        void this.store.loadImage(image.id);
    });
  }

  /** "Image 2 of 3", for a screen reader. */
  protected label(index: number): string {
    return `Image ${index + 1} of ${this.note().images.length}`;
  }

  /** Opens an image large. */
  protected open(image: MeetingNoteImage, index: number): void {
    this.dialogs.open<unknown, ImageViewerData>(ImageViewerDialog, {
      data: {
        store: this.store,
        image,
        heading: `${this.label(index)} · ${this.note().text}`,
      },
      width: '960px',
    });
  }
}
