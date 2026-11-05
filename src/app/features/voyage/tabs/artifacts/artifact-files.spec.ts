import {
  PREVIEW_LIMIT_BYTES,
  displayText,
  fileKind,
  formatSize,
  isTooLarge,
  kindLabel,
  prettyJson,
  textBytes,
} from './artifact-files';

describe('fileKind', () => {
  it('reads markdown and JSON from the extension', () => {
    expect(fileKind('implementation-plan.md')).toBe('markdown');
    expect(fileKind('PLAN.MARKDOWN')).toBe('markdown');
    expect(fileKind('state.json')).toBe('json');
    expect(fileKind('notes.txt')).toBe('text');
  });

  it('shows raster images as pictures, and keeps SVG as text', () => {
    expect(fileKind('design/frames/118-4993.png')).toBe('image');
    expect(fileKind('shot.JPEG')).toBe('image');
    expect(fileKind('frame', 'image/png')).toBe('image');
    expect(fileKind('logo.svg')).toBe('text');
    expect(fileKind('logo', 'image/svg+xml')).toBe('text');
  });

  it('falls back to the media type', () => {
    expect(fileKind('plan', 'text/markdown')).toBe('markdown');
    expect(fileKind('state', 'application/json')).toBe('json');
    expect(fileKind('state', 'application/merge-patch+json')).toBe('json');
    expect(fileKind('blob', 'application/octet-stream')).toBe('text');
  });
});

describe('kindLabel', () => {
  it('names the four kinds as the tag shows them', () => {
    expect(kindLabel('markdown')).toBe('Markdown');
    expect(kindLabel('json')).toBe('JSON');
    expect(kindLabel('image')).toBe('Image');
    expect(kindLabel('text')).toBe('Text');
  });
});

describe('sizes', () => {
  it('counts UTF-8 bytes, not code units', () => {
    expect(textBytes('açorda')).toBe(7);
    expect(textBytes('')).toBe(0);
  });

  it('calls a file over the limit too large, and the limit itself fine', () => {
    expect(isTooLarge(PREVIEW_LIMIT_BYTES)).toBe(false);
    expect(isTooLarge(PREVIEW_LIMIT_BYTES + 1)).toBe(true);
  });

  it('writes sizes as the file list does', () => {
    expect(formatSize(812)).toBe('812 B');
    expect(formatSize(3_500)).toBe('3.4 KB');
    expect(formatSize(1_258_291)).toBe('1.2 MB');
  });
});

describe('prettyJson and displayText', () => {
  it('re-indents JSON with two spaces so a line diff means something', () => {
    expect(prettyJson('{"b":1,"a":[2]}')).toBe(
      '{\n  "b": 1,\n  "a": [\n    2\n  ]\n}'
    );
  });

  it('leaves text that is not valid JSON as it is', () => {
    expect(prettyJson('{oops')).toBe('{oops');
  });

  it('shows JSON re-indented and the rest untouched', () => {
    expect(displayText('json', '{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(displayText('markdown', '# Plan')).toBe('# Plan');
    expect(displayText('text', '{"a":1}')).toBe('{"a":1}');
  });
});
