import { figmaLinksInput, MAX_FIGMA_LINKS } from './figma-links';

const FRAME = 'https://www.figma.com/design/Fk2/Billing-v2?node-id=12-40';

describe('figmaLinksInput', () => {
  it('takes one frame link per line, ignoring blank lines and spaces', () => {
    expect(
      figmaLinksInput(
        `  ${FRAME}  \n\nhttps://www.figma.com/proto/Fk2/Billing-v2?node-id=12-41\n`
      )
    ).toEqual({
      ok: true,
      links: [
        FRAME,
        'https://www.figma.com/proto/Fk2/Billing-v2?node-id=12-41',
      ],
    });
  });

  it('says which line is not a Figma link, or names no frame', () => {
    expect(figmaLinksInput(`${FRAME}\nhttps://example.com/x`)).toEqual({
      ok: false,
      message: 'Line 2 is not a figma.com design link.',
    });
    expect(
      figmaLinksInput('https://www.figma.com/design/Fk2/Billing-v2')
    ).toEqual({
      ok: false,
      message:
        'Line 1 names no frame: copy the link to the frame, with its node-id.',
    });
  });

  it('refuses no link, too many links and the same link twice', () => {
    expect(figmaLinksInput(' \n ').ok).toBe(false);
    expect(
      figmaLinksInput(
        Array.from(
          { length: MAX_FIGMA_LINKS + 1 },
          (_, i) => `${FRAME}${i}`
        ).join('\n')
      ).ok
    ).toBe(false);
    expect(figmaLinksInput(`${FRAME}\n${FRAME}`)).toEqual({
      ok: false,
      message: 'A link is there twice.',
    });
  });
});
