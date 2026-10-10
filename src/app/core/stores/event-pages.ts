import type { ApiClient } from '@core/api/api-client';
import { ok, type ApiResult } from '@core/api/api-error';
import type { AhoyEvent } from '@core/api/types';

/** Events asked for per page: the API's maximum (G8). */
export const EVENT_PAGE_LIMIT = 500;

/** At most this many pages per read (100 000 events), so that a cursor that never ends cannot loop for ever. */
export const MAX_EVENT_PAGES = 200;

/**
 * Reads a story's events after `after` (from the start when null), page by page, oldest first, handing each page to
 * `onPage`. Gives the id to continue from next time, or the first error.
 */
export async function readStoryEvents(
  api: Pick<ApiClient, 'listStoryEvents'>,
  key: string,
  after: string | null,
  onPage: (events: readonly AhoyEvent[]) => void,
  isCancelled: () => boolean = () => false
): Promise<ApiResult<string | null>> {
  let cursor = after;
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const result = await api.listStoryEvents(key, {
      ...(cursor !== null ? { after: cursor } : {}),
      limit: EVENT_PAGE_LIMIT,
    });
    if (!result.ok || isCancelled()) return result.ok ? ok(cursor) : result;
    onPage(result.value.items);
    cursor = result.value.lastEventId ?? cursor;
    if (result.value.items.length < EVENT_PAGE_LIMIT) break;
  }
  return ok(cursor);
}
