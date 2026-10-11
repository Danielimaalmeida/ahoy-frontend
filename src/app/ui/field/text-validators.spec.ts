import { FormControl } from '@angular/forms';
import { maxTrimmed, requiredText } from './text-validators';

describe('requiredText', () => {
  it('refuses empty and blank text', () => {
    expect(requiredText(new FormControl('', { nonNullable: true }))).toEqual({
      required: true,
    });
    expect(
      requiredText(new FormControl('  \n ', { nonNullable: true }))
    ).toEqual({ required: true });
    expect(
      requiredText(new FormControl('Wrong repo', { nonNullable: true }))
    ).toBeNull();
  });
});

describe('maxTrimmed', () => {
  it("allows the API's 2000 characters, not counting spaces around them", () => {
    const check = maxTrimmed(2000);
    expect(
      check(new FormControl(`  ${'a'.repeat(2000)}  `, { nonNullable: true }))
    ).toBeNull();
    expect(
      check(new FormControl('a'.repeat(2001), { nonNullable: true }))
    ).toEqual({
      maxlength: { requiredLength: 2000, actualLength: 2001 },
    });
  });

  it('takes the limit it is given', () => {
    const check = maxTrimmed(5);
    expect(check(new FormControl(' abcde ', { nonNullable: true }))).toBeNull();
    expect(check(new FormControl('abcdef', { nonNullable: true }))).toEqual({
      maxlength: { requiredLength: 5, actualLength: 6 },
    });
  });
});
