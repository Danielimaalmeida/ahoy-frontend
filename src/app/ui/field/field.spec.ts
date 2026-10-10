import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { AbstractControl, ValidationErrors } from '@angular/forms';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Field, FieldControl, firstErrorMessage } from './field';

/** A validator that returns its own message, as a form's custom validators may. */
function atLeast(min: number) {
  return (c: AbstractControl<string>): ValidationErrors | null =>
    Number(c.value) >= min
      ? null
      : { budget: `At least ${min} AIU, what's already spent.` };
}

@Component({
  imports: [Field, FieldControl, ReactiveFormsModule],
  template: `
    <form [formGroup]="form">
      <ah-field
        id="budget"
        label="Total budget"
        required
        hint="A hard cap for every run of this voyage together."
        unit="AIU"
        [errorMessages]="{ required: 'Enter a budget in AIU.' }"
      >
        <input ahInput formControlName="budget" inputmode="decimal" />
      </ah-field>
      <ah-field id="cap" label="New total cap">
        <input ahInput formControlName="cap" />
      </ah-field>
      <ah-field id="key" label="Jira key" [errorText]="serverError()">
        <input ahInput mono id="jira-key" formControlName="key" />
      </ah-field>
      <ah-field id="reason" label="Reason" optional>
        <textarea ahInput formControlName="reason"></textarea>
      </ah-field>
    </form>
  `,
})
class Host {
  readonly form = new FormGroup({
    budget: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, atLeast(12)],
    }),
    cap: new FormControl('10', {
      nonNullable: true,
      validators: [atLeast(12.4)],
    }),
    key: new FormControl('PROJ-145', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true }),
  });
  readonly serverError = signal('');
}

let fixture: ComponentFixture<Host>;

function render(): HTMLElement {
  fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

/** The ids in an `aria-describedby` value. */
const describedBy = (el: Element): string[] =>
  (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);

describe('ah-field', () => {
  it('renders the README markup and links the label to the control', () => {
    const root = render();
    const field = root.querySelector('#budget > .ah-field')!;
    const label = field.querySelector('label.ah-label')!;
    const input = field.querySelector('input')!;
    expect(input.classList.contains('ah-input')).toBe(true);
    expect(input.id).not.toBe('');
    expect(label.getAttribute('for')).toBe(input.id);
    expect(label.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Total budget *'
    );
    expect(
      field.querySelector('.ah-suffix > input + .ah-suffix__unit')!.textContent
    ).toBe('AIU');
  });

  it('marks a required control for assistive technology and hides the asterisk from it', () => {
    const root = render();
    expect(
      root.querySelector('#budget .ah-req')!.getAttribute('aria-hidden')
    ).toBe('true');
    expect(
      root.querySelector('#budget input')!.getAttribute('aria-required')
    ).toBe('true');
    expect(
      root.querySelector('#cap input')!.hasAttribute('aria-required')
    ).toBe(false);
  });

  it('describes the control with its unit and hint, by ids that exist', () => {
    const root = render();
    const input = root.querySelector('#budget input')!;
    const texts = describedBy(input).map(
      (id) => document.getElementById(id)?.textContent
    );
    expect(texts).toEqual([
      'AIU',
      'A hard cap for every run of this voyage together.',
    ]);
    expect(
      root.querySelector('#cap input')!.hasAttribute('aria-describedby')
    ).toBe(false);
  });

  it('shows no error before the person touches or changes an invalid control', () => {
    const root = render();
    expect(root.querySelector('.ah-field__error')).toBeNull();
    expect(
      root.querySelector('#budget input')!.hasAttribute('aria-invalid')
    ).toBe(false);
  });

  it('shows the first error once touched, with aria-invalid and a valid aria-describedby', async () => {
    const root = render();
    const input = root.querySelector<HTMLInputElement>('#budget input')!;
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    const error = root.querySelector('#budget .ah-field__error')!;
    expect(error.textContent).toBe('Enter a budget in AIU.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(input)[0]).toBe(error.id);
    expect(document.getElementById(error.id)).toBe(error);
  });

  it("uses the validator's own text, follows typing, and clears when valid", async () => {
    const root = render();
    const input = root.querySelector<HTMLInputElement>('#budget input')!;
    input.value = '5';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(root.querySelector('#budget .ah-field__error')!.textContent).toBe(
      "At least 12 AIU, what's already spent."
    );
    input.value = '25';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(root.querySelector('#budget .ah-field__error')).toBeNull();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('shows errors when the form marks every control as touched', async () => {
    const root = render();
    fixture.componentInstance.form.markAllAsTouched();
    await fixture.whenStable();
    expect(root.querySelector('#budget .ah-field__error')!.textContent).toBe(
      'Enter a budget in AIU.'
    );
    expect(root.querySelector('#cap .ah-field__error')!.textContent).toBe(
      "At least 12.4 AIU, what's already spent."
    );
  });

  it("shows a server error whatever the control's state, and keeps the control's own id", async () => {
    const root = render();
    const input = root.querySelector('#key input')!;
    expect(input.id).toBe('jira-key');
    expect(input.classList.contains('ah-input--mono')).toBe(true);
    expect(root.querySelector('#key label')!.getAttribute('for')).toBe(
      'jira-key'
    );
    fixture.componentInstance.serverError.set('PROJ-145 already has a voyage.');
    await fixture.whenStable();
    expect(root.querySelector('#key .ah-field__error')!.textContent).toBe(
      'PROJ-145 already has a voyage.'
    );
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('says (optional) and works with a textarea', () => {
    const root = render();
    expect(root.querySelector('#reason .ah-field__optional')!.textContent).toBe(
      '(optional)'
    );
    expect(root.querySelector('#reason textarea.ah-input')).not.toBeNull();
  });

  it('gives every control a unique id', () => {
    const ids = Array.from(render().querySelectorAll('.ah-input')).map(
      (el) => el.id
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('firstErrorMessage', () => {
  const cases: {
    errors: ValidationErrors | null;
    messages: Readonly<Record<string, string>>;
    expected: string;
  }[] = [
    { errors: null, messages: {}, expected: '' },
    { errors: {}, messages: {}, expected: '' },
    { errors: { required: true }, messages: {}, expected: 'This is required.' },
    {
      errors: { required: true },
      messages: { required: 'Enter a key.' },
      expected: 'Enter a key.',
    },
    {
      errors: { min: { min: 1, actual: 0 } },
      messages: {},
      expected: 'Check this value.',
    },
    {
      errors: { budget: 'At least 12.4 AIU.' },
      messages: {},
      expected: 'At least 12.4 AIU.',
    },
    {
      errors: { pattern: true, required: true },
      messages: { required: 'No.' },
      expected: 'Check this value.',
    },
  ];

  it.each(cases)(
    'gives $expected for $errors',
    ({ errors, messages, expected }) => {
      expect(firstErrorMessage(errors, messages)).toBe(expected);
    }
  );
});
