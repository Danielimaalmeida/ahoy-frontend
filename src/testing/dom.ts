/** Helpers for component specs that read and drive the rendered page, as a person would. */
import problems from './fixtures/problems.json';

/** The problem body the API sends for `code`. */
export function problem(code: string): (typeof problems)[number] {
  const found = problems.find((p) => p.code === code);
  if (found === undefined) throw new Error(`no problem ${code}`);
  return found;
}

/** The text of an element, whitespace collapsed. */
export function text(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The buttons whose text or accessible name is `label`. */
export function buttonsNamed(
  container: Element,
  label: string
): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter(
    (b) => text(b) === label || b.getAttribute('aria-label') === label
  );
}

/** The button whose text or accessible name is `label`. */
export function buttonNamed(
  container: Element,
  label: string
): HTMLButtonElement {
  const found = buttonsNamed(container, label)[0];
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
}

/** The open dialog (the CDK puts it in an overlay under `body`), or null when none is open. */
export function openDialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '.cdk-overlay-container .ah-dialog'
  );
}

/** The open dialog; throws when none is open. */
export function dialog(): HTMLElement {
  const element = openDialog();
  if (element === null) throw new Error('no dialog open');
  return element;
}

/** Closes every overlay a spec left open. */
export function removeOverlays(): void {
  document
    .querySelectorAll('.cdk-overlay-container')
    .forEach((e) => e.remove());
}

/** The control of the field labelled `label` in `container`. */
export function field<T extends HTMLElement = HTMLInputElement>(
  container: Element,
  label: string
): T {
  const found = [...container.querySelectorAll('label')].find((l) =>
    text(l).startsWith(label)
  );
  const id = found?.getAttribute('for');
  const control = id ? container.querySelector<T>(`#${id}`) : null;
  if (control === null) throw new Error(`no field labelled ${label}`);
  return control;
}

/** Types `value` into a text control. */
export function type(
  control: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  control.value = value;
  control.dispatchEvent(new Event('input'));
}

/** Chooses `value` in a select. */
export function choose(control: HTMLSelectElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event('change'));
}

/** The value of a row of a definition list: the `dd` after the `dt` named `term`. */
export function definition(container: Element, term: string): string {
  const dt = [...container.querySelectorAll('dt')].find(
    (d) => text(d) === term
  );
  const dd = dt?.nextElementSibling;
  return [...(dd?.children ?? [])].map((c) => text(c)).join(' ');
}

/** The headings of the banners in `container`. */
export function bannerHeadings(container: Element): string[] {
  return [...container.querySelectorAll('ah-banner')].map((b) =>
    text(b.querySelector('.ah-banner__title, b'))
  );
}
