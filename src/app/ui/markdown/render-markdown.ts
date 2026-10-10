import { markdownBlocks } from '@domain/text-diff';
import type { RendererObject, Token, Tokens } from 'marked';
import { Marked } from 'marked';

/** Options of `renderMarkdown`. */
export interface RenderMarkdownOptions {
  /**
   * Indices into `markdownBlocks(source)` (domain `text-diff`) of the top-level blocks to mark as changed: they are
   * wrapped in `ah-mark`. `changedBlocks(previous, source)` gives them.
   */
  readonly changedBlocks?: readonly number[];
}

/** The URL schemes a link may use; anything else (`javascript:`, `data:`, relative paths) renders as plain text. */
const LINK_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:'];

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for an HTML text node or a double-quoted attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** The link target if it is an absolute `http(s)` or `mailto` URL, normalised by `URL`; otherwise `null`. */
export function safeHref(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href.trim());
  } catch {
    return null;
  }
  return LINK_PROTOCOLS.includes(url.protocol) ? url.href : null;
}

/**
 * The renderer overrides that make agent markdown safe to show: raw HTML is escaped, images are replaced by their
 * alt text (nothing loads), links keep only `http(s)`/`mailto` targets and open in a new tab without an opener, and
 * task-list checkboxes become text (the sanitizer would drop an `<input>`).
 */
const SAFE_RENDERER: RendererObject = {
  html(token: Tokens.HTML | Tokens.Tag): string {
    const escaped = escapeHtml(token.text);
    return 'block' in token && token.block ? `<p>${escaped}</p>\n` : escaped;
  },
  image({ text }: Tokens.Image): string {
    return text.trim() === ''
      ? ''
      : `<span class="ah-markdown__image">[image: ${escapeHtml(text)}]</span>`;
  },
  link({ href, title, tokens }: Tokens.Link): string {
    const label = this.parser.parseInline(tokens);
    const safe = safeHref(href);
    if (safe === null) return label;
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${escapeHtml(safe)}"${titleAttr} target="_blank" rel="noopener noreferrer">${label}</a>`;
  },
  checkbox({ checked }: Tokens.Checkbox): string {
    return `<span class="ah-markdown__task">${checked ? '[x]' : '[ ]'}</span> `;
  },
};

const MARKED = new Marked({
  async: false,
  gfm: true,
  breaks: false,
  renderer: SAFE_RENDERER,
});

/** Where each changed block sits in the source, as `[start, end)` offsets. Blocks not found are skipped. */
function changedRanges(
  source: string,
  changed: ReadonlySet<number>
): [number, number][] {
  const ranges: [number, number][] = [];
  let cursor = 0;
  markdownBlocks(source).forEach((block, index) => {
    const start = source.indexOf(block, cursor);
    if (start < 0) return;
    cursor = start + block.length;
    if (changed.has(index)) ranges.push([start, cursor]);
  });
  return ranges;
}

/**
 * Renders untrusted markdown (plans, snapshots, agent output) to HTML for `[innerHTML]`, which Angular sanitizes
 * again. Raw HTML is shown as text, images never load, and links are limited to `http(s)` and `mailto`.
 * With `changedBlocks`, the top-level blocks they name are wrapped in `<div class="ah-mark">`; a block that
 * spans several of them (a loose list) is marked when any of them changed.
 */
export function renderMarkdown(
  source: string,
  options: RenderMarkdownOptions = {}
): string {
  const text = source.replace(/\r\n?/g, '\n');
  const changed = new Set(options.changedBlocks ?? []);
  if (changed.size === 0) return MARKED.parse(text, { async: false });

  const ranges = changedRanges(text, changed);
  const tokens = MARKED.lexer(text);
  const groups: { marked: boolean; tokens: Token[] }[] = [];
  let offset = 0;
  for (const token of tokens) {
    const start = offset;
    offset += token.raw.length;
    if (token.type === 'space') continue;
    const marked = ranges.some(([from, to]) => from < offset && to > start);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.marked === marked) last.tokens.push(token);
    else groups.push({ marked, tokens: [token] });
  }
  return groups
    .map((group) => {
      // Reference links were resolved by the lexer, so a group renders on its own.
      const html = MARKED.parser(group.tokens);
      return group.marked ? `<div class="ah-mark">${html}</div>\n` : html;
    })
    .join('');
}
