import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Markdown } from './markdown';

const HOSTILE = [
  '# Plan',
  '',
  "<script>window.__ahXss = 'script'</script>",
  '',
  '<img src="x" onerror="window.__ahXss = \'img\'">',
  '',
  "[click](javascript:window.__ahXss='link')",
  '',
  '<div onclick="window.__ahXss = \'div\'">embedded</div>',
  '',
  '![pixel](https://evil.example/pixel.png)',
  '',
  '[docs](https://example.com/docs)',
].join('\n');

@Component({
  imports: [Markdown],
  template: `<ah-markdown [source]="source()" [changedBlocks]="changed()" />`,
})
class Host {
  readonly source = signal(HOSTILE);
  readonly changed = signal<readonly number[]>([]);
}

async function render(): Promise<{
  root: HTMLElement;
  host: Host;
  settle: () => Promise<void>;
}> {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return {
    root: fixture.nativeElement as HTMLElement,
    host: fixture.componentInstance,
    settle: () => fixture.whenStable(),
  };
}

describe('ah-markdown', () => {
  afterEach(() => {
    delete (window as { __ahXss?: unknown }).__ahXss;
    vi.restoreAllMocks();
  });

  it("renders agent markdown with nothing that runs or loads, and nothing left for Angular's sanitizer", async () => {
    const warn = vi.spyOn(console, 'warn');
    const { root } = await render();
    const md = root.querySelector('ah-markdown')!;
    expect(md.classList.contains('ah-markdown')).toBe(true);
    expect(md.querySelector('h1')!.textContent).toBe('Plan');
    expect(md.querySelector('script, img, iframe, div[onclick]')).toBeNull();
    expect(md.textContent).toContain('<script>');
    expect(md.textContent).toContain('[image: pixel]');
    const links = Array.from(md.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://example.com/docs',
    ]);
    for (const el of Array.from(md.querySelectorAll('*'))) {
      expect(
        Array.from(el.attributes).filter(
          (a) => /^on/i.test(a.name) || a.name === 'src'
        )
      ).toEqual([]);
    }
    for (const el of Array.from(md.querySelectorAll('p, a, h1')))
      (el as HTMLElement).click();
    expect((window as { __ahXss?: unknown }).__ahXss).toBeUndefined();
    expect(warn.mock.calls.flat().join(' ')).not.toContain(
      'sanitizing HTML stripped some content'
    );
  });

  it('re-renders when the source or the changed blocks change', async () => {
    const { root, host, settle } = await render();
    host.source.set('First.\n\nSecond.');
    host.changed.set([1]);
    await settle();
    const md = root.querySelector('ah-markdown')!;
    expect(md.querySelector('.ah-mark')!.textContent.trim()).toBe('Second.');
    expect(md.querySelectorAll('p')).toHaveLength(2);
  });
});
