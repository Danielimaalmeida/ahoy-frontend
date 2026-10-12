import { Component, input, output } from '@angular/core';
import { Button } from '@ui/button/button';
import { EmptyState } from '@ui/empty-state/empty-state';

/**
 * The whole page for a signed-in user who may not use Ahoy: their qnumber is not on the list of allowed users. It says
 * who they are signed in as, who to ask, and offers to sign out (to try another account).
 */
@Component({
  selector: 'ah-access-denied',
  imports: [Button, EmptyState],
  template: `
    <section class="ah-access-denied" aria-labelledby="ah-access-denied-title">
      <h1 id="ah-access-denied-title" class="ah-access-denied__title">
        Access denied
      </h1>
      <ah-empty-state
        heading="Ahoy is open only to the users on its list"
        icon="lock"
      >
        @if (qnumber(); as q) {
          You are signed in as {{ q }}, which is not on it.
        } @else {
          Ahoy could not read a qnumber from your sign-in.
        }
        Ask the Ahoy team to add you.
        <button ahEmptyAction ahButton type="button" (click)="signOut.emit()">
          Sign out
        </button>
      </ah-empty-state>
    </section>
  `,
  styles: `
    .ah-access-denied {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 560px;
      margin: 64px auto;
      padding-inline: 16px;
    }
    .ah-access-denied__title {
      margin: 0;
      font-size: 20px;
    }
  `,
})
export class AccessDenied {
  /** The user's qnumber, or null when none could be read. */
  readonly qnumber = input.required<string | null>();
  /** The user asked to sign out. */
  readonly signOut = output();
}
