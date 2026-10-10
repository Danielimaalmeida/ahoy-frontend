import { changedBlocks, markdownBlocks } from '@domain/text-diff';
import { escapeHtml, renderMarkdown, safeHref } from './render-markdown';

/** Parses rendered HTML into a detached element, as the browser would, without running anything. */
function dom(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(
    `<div id="root">${html}</div>`,
    'text/html'
  );
  return doc.getElementById('root')!;
}

/** Every attribute of every element, as `tag[name=value]`. */
function attributes(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll('*')).flatMap((el) =>
    Array.from(el.attributes).map(
      (a) => `${el.tagName.toLowerCase()}[${a.name}=${a.value}]`
    )
  );
}

/** Asserts the HTML has no element or attribute that can run code or fetch anything. */
function expectInert(html: string): void {
  const root = dom(html);
  expect(
    root.querySelectorAll(
      'script, img, iframe, object, embed, svg, style, link, form, input, video'
    )
  ).toHaveLength(0);
  for (const attr of attributes(root)) {
    expect(attr).not.toMatch(/^\w+\[on/i);
    expect(attr).not.toMatch(
      /\[(src|srcset|style|background|formaction|action)=/i
    );
    expect(attr.toLowerCase()).not.toContain('javascript:');
  }
  for (const a of Array.from(root.querySelectorAll('a'))) {
    expect(a.getAttribute('href')).toMatch(/^(https?:|mailto:)/);
  }
}

describe('renderMarkdown', () => {
  it('renders headings, lists, emphasis, code and tables', () => {
    const html = renderMarkdown(
      [
        '## Summary',
        '',
        "Show each invoice's **due date** with `isOverdue`.",
        '',
        '- one',
        '- two',
        '',
        '```ts',
        'const a = 1 < 2;',
        '```',
        '',
        '| WP | Size |',
        '| -- | ---- |',
        '| 1  | S    |',
      ].join('\n')
    );
    const root = dom(html);
    expect(root.querySelector('h2')!.textContent).toBe('Summary');
    expect(root.querySelector('strong')!.textContent).toBe('due date');
    expect(root.querySelector('p code')!.textContent).toBe('isOverdue');
    expect(root.querySelectorAll('ul > li')).toHaveLength(2);
    expect(root.querySelector('pre code')!.textContent).toBe(
      'const a = 1 < 2;\n'
    );
    expect(root.querySelectorAll('table td')).toHaveLength(2);
    expectInert(html);
  });

  describe('untrusted input (XSS)', () => {
    it('shows a <script> block as text', () => {
      const html = renderMarkdown(
        '<script>window.__xss = 1</script>\n\nAfter.'
      );
      expect(dom(html).querySelector('script')).toBeNull();
      expect(dom(html).textContent).toContain(
        '<script>window.__xss = 1</script>'
      );
      expectInert(html);
    });

    it('shows an inline <script> inside a paragraph as text', () => {
      const html = renderMarkdown('Hello <script>alert(1)</script> world');
      expect(dom(html).textContent.trim()).toBe(
        'Hello <script>alert(1)</script> world'
      );
      expectInert(html);
    });

    it('shows <img onerror> as text, so nothing loads or runs', () => {
      const html = renderMarkdown('<img src="x" onerror="alert(1)">');
      expect(dom(html).querySelector('img')).toBeNull();
      expect(dom(html).textContent).toContain(
        '<img src="x" onerror="alert(1)">'
      );
      expectInert(html);
    });

    it.each([
      '[x](javascript:alert(1))',
      '[x](JaVaScRiPt:alert(1))',
      '[x]( javascript:alert(1) )',
      '[x](java\tscript:alert(1))',
      '[x](javascript&#58;alert(1))',
      '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
      '[x](vbscript:msgbox(1))',
      '[x](file:///etc/passwd)',
      '<javascript:alert(1)>',
      '[x][ref]\n\n[ref]: javascript:alert(1)',
    ])('drops the link target of %j and keeps its text', (source) => {
      const html = renderMarkdown(source);
      expect(dom(html).querySelector('a')).toBeNull();
      expectInert(html);
    });

    it('drops relative and protocol-relative links', () => {
      for (const source of [
        '[x](/stories/PROJ-1)',
        '[x](//evil.example/x)',
        '[x](#top)',
      ]) {
        const html = renderMarkdown(source);
        expect(dom(html).querySelector('a')).toBeNull();
        expect(dom(html).textContent.trim()).toBe('x');
      }
    });

    it('shows embedded HTML as text: event handlers, iframes, styles, forms and SVG', () => {
      const source = [
        '<div onclick="alert(1)">click</div>',
        '',
        '<iframe src="https://evil.example"></iframe>',
        '',
        '<style>body { display: none }</style>',
        '',
        '<form action="https://evil.example"><input name="q"></form>',
        '',
        '<svg onload="alert(1)"><circle r="1"/></svg>',
        '',
        'Inline <a href="javascript:alert(1)">link</a> and <b onmouseover="alert(1)">bold</b>.',
      ].join('\n');
      const html = renderMarkdown(source);
      const root = dom(html);
      expect(
        root.querySelector('div, iframe, style, form, svg, b, a')
      ).toBeNull();
      expect(root.textContent).toContain('<div onclick="alert(1)">click</div>');
      expect(root.textContent).toContain(
        '<a href="javascript:alert(1)">link</a>'
      );
      expectInert(html);
    });

    it('never loads a remote image: it shows the alt text instead', () => {
      const html = renderMarkdown(
        '![A tracking pixel](https://evil.example/pixel.png "t")'
      );
      const root = dom(html);
      expect(root.querySelector('img')).toBeNull();
      expect(root.textContent.trim()).toBe('[image: A tracking pixel]');
      expect(html).not.toContain('evil.example');
      expectInert(html);
    });

    it('escapes quotes in link targets and titles, so no attribute can be injected', () => {
      const html = renderMarkdown(
        '[x](https://example.com/a"onmouseover="alert(1) "t\\" onclick=\\"alert(2)")'
      );
      const a = dom(html).querySelector('a');
      if (a !== null) {
        expect(Array.from(a.attributes).map((x) => x.name)).toEqual([
          'href',
          'title',
          'target',
          'rel',
        ]);
      }
      expectInert(html);
    });

    it('escapes HTML in code spans and fenced code', () => {
      const html = renderMarkdown(
        '`<img src=x onerror=alert(1)>`\n\n```html\n<script>alert(1)</script>\n```'
      );
      const root = dom(html);
      expect(root.querySelector('code')!.textContent).toBe(
        '<img src=x onerror=alert(1)>'
      );
      expect(root.querySelector('pre code')!.textContent).toBe(
        '<script>alert(1)</script>\n'
      );
      expectInert(html);
    });

    it('escapes a hostile code-block language', () => {
      const html = renderMarkdown('```"><script>alert(1)</script>\nx\n```');
      expect(dom(html).querySelector('script')).toBeNull();
      expectInert(html);
    });

    it('renders task-list checkboxes as text, not inputs', () => {
      const html = renderMarkdown('- [x] done\n- [ ] open');
      expect(dom(html).querySelector('input')).toBeNull();
      expect(dom(html).textContent).toContain('[x] done');
      expect(dom(html).textContent).toContain('[ ] open');
    });
  });

  describe('links', () => {
    it('opens http(s) and mailto links in a new tab without an opener', () => {
      const html = renderMarkdown(
        '[docs](https://example.com/a?b=1&c=2) [mail](mailto:alex@example.com) <https://example.com/auto>'
      );
      const links = Array.from(dom(html).querySelectorAll('a'));
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        'https://example.com/a?b=1&c=2',
        'mailto:alex@example.com',
        'https://example.com/auto',
      ]);
      for (const a of links) {
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      }
    });

    it("keeps the label's own markdown", () => {
      const a = dom(
        renderMarkdown('[**bold** label](https://example.com)')
      ).querySelector('a')!;
      expect(a.innerHTML).toBe('<strong>bold</strong> label');
    });
  });

  describe('changed blocks', () => {
    const previous = '# Plan\n\nKeep the sort.\n\n- WP1\n- WP2\n\nTail.';
    const next = '# Plan\n\nChange the sort.\n\n- WP1\n- WP2\n- WP3\n\nTail.';

    it('wraps the blocks the domain reports as changed in ah-mark, and only those', () => {
      const changed = changedBlocks(previous, next);
      expect(changed).toEqual([1, 2]);
      const root = dom(renderMarkdown(next, { changedBlocks: changed }));
      const marks = Array.from(root.querySelectorAll(':scope > .ah-mark'));
      expect(marks).toHaveLength(1);
      expect(marks[0]!.querySelector('p')!.textContent).toBe(
        'Change the sort.'
      );
      expect(marks[0]!.querySelectorAll('li')).toHaveLength(3);
      expect(root.querySelector(':scope > h1')!.textContent).toBe('Plan');
      expect(root.lastElementChild!.textContent).toBe('Tail.');
    });

    it('marks non-adjacent blocks separately and keeps the same output as without marks', () => {
      const source = 'A\n\nB\n\nC';
      const root = dom(renderMarkdown(source, { changedBlocks: [0, 2] }));
      expect(
        Array.from(root.children).map(
          (c) => `${c.tagName}:${c.textContent.trim()}`
        )
      ).toEqual(['DIV:A', 'P:B', 'DIV:C']);
      const plain = renderMarkdown(source, { changedBlocks: [] });
      expect(dom(plain).innerHTML.replace(/\s/g, '')).toBe(
        '<p>A</p><p>B</p><p>C</p>'
      );
    });

    it('marks a loose list as one block when any of its items changed', () => {
      const source = '- one\n\n- two\n\n- three';
      expect(markdownBlocks(source)).toHaveLength(3);
      const root = dom(renderMarkdown(source, { changedBlocks: [2] }));
      const mark = root.querySelector('.ah-mark')!;
      expect(mark.querySelectorAll('li')).toHaveLength(3);
    });

    it('keeps fenced code with blank lines in one block', () => {
      const source = 'Intro\n\n```\na\n\nb\n```';
      const root = dom(renderMarkdown(source, { changedBlocks: [1] }));
      expect(root.querySelector('.ah-mark pre code')!.textContent).toBe(
        'a\n\nb\n'
      );
    });

    it('resolves reference links defined in another block', () => {
      const root = dom(
        renderMarkdown('See [docs][d].\n\n[d]: https://example.com/docs', {
          changedBlocks: [0],
        })
      );
      expect(root.querySelector('.ah-mark a')!.getAttribute('href')).toBe(
        'https://example.com/docs'
      );
    });

    it("handles CRLF line endings and indices that don't exist", () => {
      const root = dom(renderMarkdown('A\r\n\r\nB', { changedBlocks: [1, 9] }));
      expect(root.querySelector('.ah-mark')!.textContent.trim()).toBe('B');
    });
  });
});

describe('safeHref', () => {
  it('accepts absolute http, https and mailto URLs', () => {
    expect(safeHref('https://example.com/x')).toBe('https://example.com/x');
    expect(safeHref(' http://example.com ')).toBe('http://example.com/');
    expect(safeHref('mailto:alex@example.com')).toBe('mailto:alex@example.com');
  });

  it('rejects every other scheme and anything relative', () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://x',
      '/a',
      'a',
      '//x',
      '',
      '%',
    ]) {
      expect(safeHref(href)).toBeNull();
    }
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
  });
});
