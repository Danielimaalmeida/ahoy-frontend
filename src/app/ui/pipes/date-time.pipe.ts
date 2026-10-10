import type { PipeTransform } from '@angular/core';
import { Pipe } from '@angular/core';
import { absoluteTime } from '@domain/time';

/** Shows a moment for logs and records as "Tue 09:48", in the browser's time zone. A missing value gives an em dash. */
@Pipe({ name: 'ahDateTime' })
export class DateTimePipe implements PipeTransform {
  transform(at: Date | string | null | undefined): string {
    return at === null || at === undefined ? '—' : absoluteTime(at);
  }
}
