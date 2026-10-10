import type { AbstractControl, ValidationErrors } from '@angular/forms';

/** Requires text that is not only spaces (`Validators.required` takes "   "); the API trims nothing and wants 1 char. */
export function requiredText(
  control: AbstractControl<string>
): ValidationErrors | null {
  return control.value.trim() === '' ? { required: true } : null;
}

/** Limits the trimmed text to `max` characters: what is sent is trimmed, so trailing spaces do not count. */
export function maxTrimmed(
  max: number
): (control: AbstractControl<string>) => ValidationErrors | null {
  return (control) => {
    const length = control.value.trim().length;
    return length > max
      ? { maxlength: { requiredLength: max, actualLength: length } }
      : null;
  };
}
