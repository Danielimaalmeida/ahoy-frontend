import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccessDenied } from './access-denied';

@Component({
  imports: [AccessDenied],
  template: `<ah-access-denied
    [qnumber]="qnumber()"
    (signOut)="signedOut = signedOut + 1"
  />`,
})
class Host {
  readonly qnumber = signal<string | null>('q654321');
  signedOut = 0;
}

function render(qnumber: string | null) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.qnumber.set(qnumber);
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

describe('ah-access-denied', () => {
  it('says access is denied and names the qnumber the user is signed in as', () => {
    const { root } = render('q654321');
    expect(root.querySelector('h1')!.textContent!.trim()).toBe('Access denied');
    expect(root.textContent).toContain(
      'You are signed in as q654321, which is not on it.'
    );
    expect(root.textContent).toContain('Ask the Ahoy team to add you.');
  });

  it('says so when no qnumber could be read', () => {
    expect(render(null).root.textContent).toContain(
      'Ahoy could not read a qnumber from your sign-in.'
    );
  });

  it('offers to sign out', () => {
    const { fixture, root } = render('q654321');
    root.querySelector<HTMLButtonElement>('button')!.click();
    expect(fixture.componentInstance.signedOut).toBe(1);
  });
});
