/** The most Figma links one design refresh takes (`RefreshDesignRequest.figmaLinks`). */
export const MAX_FIGMA_LINKS = 10;

/** The longest Figma link the API takes. */
const MAX_FIGMA_URL_CHARS = 2000;

/** A figma.com `/design/`, `/file/` or `/proto/` link (a branch link too), as the harness reads one. */
const FIGMA_LINK =
  /^https?:\/\/(?:www\.)?figma\.com\/(?:design|file|proto)\/[A-Za-z0-9]+(?:\/\S*)?$/;

/** A frame's node id in a link: `12-40` or `12:40`. */
const NODE_ID = /^\d+[:-]\d+$/;

/** The Figma links typed for a design refresh, one per line, or what is wrong with them. */
export type FigmaLinksInput =
  | { readonly ok: true; readonly links: readonly string[] }
  | { readonly ok: false; readonly message: string };

/**
 * Reads the Figma links a person typed for a design refresh: one per line, blank lines ignored, each a figma.com link
 * that names a frame (`node-id` or `focus-id`), none twice, 1 to {@link MAX_FIGMA_LINKS}. The API checks them again;
 * this only says early what it would refuse.
 */
export function figmaLinksInput(text: string): FigmaLinksInput {
  const links = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (links.length === 0)
    return { ok: false, message: 'Paste at least one Figma link.' };
  if (links.length > MAX_FIGMA_LINKS)
    return {
      ok: false,
      message: `At most ${MAX_FIGMA_LINKS} Figma links, one per line.`,
    };
  for (const [i, link] of links.entries()) {
    const line = `Line ${i + 1}`;
    if (link.length > MAX_FIGMA_URL_CHARS || !FIGMA_LINK.test(link))
      return { ok: false, message: `${line} is not a figma.com design link.` };
    const params = new URL(link).searchParams;
    const node = params.get('focus-id') ?? params.get('node-id');
    if (node === null || !NODE_ID.test(node))
      return {
        ok: false,
        message: `${line} names no frame: copy the link to the frame, with its node-id.`,
      };
  }
  if (new Set(links).size !== links.length)
    return { ok: false, message: 'A link is there twice.' };
  return { ok: true, links };
}
