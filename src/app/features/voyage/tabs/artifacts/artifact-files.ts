/** Above this many bytes a file is not previewed or compared: "Too large to preview". */
export const PREVIEW_LIMIT_BYTES = 1_048_576;

/** How the viewer shows a file. */
export type FileKind = 'markdown' | 'json' | 'image' | 'text';

/** The raster images the viewer shows as pictures. SVG stays text: it can carry script, and agents write it. */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'] as const;
const IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

/** The file's kind, from its extension and then its media type. Anything else is plain text. */
export function fileKind(
  path: string,
  mediaType: string | null = null
): FileKind {
  const lower = path.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.json')) return 'json';
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'image';
  const media = (mediaType ?? '').toLowerCase();
  if (IMAGE_MEDIA_TYPES.some((type) => media.startsWith(type))) return 'image';
  if (media.startsWith('text/markdown')) return 'markdown';
  if (media.startsWith('application/json') || media.includes('+json'))
    return 'json';
  return 'text';
}

/** "Markdown", "JSON", "Image" or "Text". */
export function kindLabel(kind: FileKind): string {
  switch (kind) {
    case 'markdown':
      return 'Markdown';
    case 'json':
      return 'JSON';
    case 'image':
      return 'Image';
    case 'text':
      return 'Text';
  }
}

/** The size of `text` in UTF-8 bytes. */
export function textBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Whether a file of `bytes` is too large to preview. */
export function isTooLarge(bytes: number): boolean {
  return bytes > PREVIEW_LIMIT_BYTES;
}

/** JSON re-indented with two spaces, so a line diff means something; text that is not JSON comes back unchanged. */
export function prettyJson(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    return JSON.stringify(parsed, null, 2) ?? text;
  } catch {
    return text;
  }
}

/** The text as the viewer and the diff show it: JSON pretty-printed, the rest as it is. */
export function displayText(kind: FileKind, text: string): string {
  return kind === 'json' ? prettyJson(text) : text;
}

/** "812 B", "3.4 KB", "1.2 MB". */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
