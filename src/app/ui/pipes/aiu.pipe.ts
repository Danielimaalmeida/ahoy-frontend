import type { PipeTransform } from "@angular/core";
import { Pipe } from "@angular/core";
import { formatAiu } from "@domain/aiu";

/**
 * Shows integer nano-AIU as AIU with a fixed number of decimals: one in lists (the default), two on run detail.
 * `{{ story.spentNanoAiu | ahAiu }}` gives "12.4"; `| ahAiu: 2` gives "12.40". A missing value gives an em dash.
 */
@Pipe({ name: "ahAiu" })
export class AiuPipe implements PipeTransform {
  transform(nanoAiu: number | null | undefined, decimals = 1): string {
    return nanoAiu === null || nanoAiu === undefined ? "—" : formatAiu(nanoAiu, decimals);
  }
}
