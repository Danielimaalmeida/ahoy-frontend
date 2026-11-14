import { inject } from '@angular/core';
import { Router, type CanMatchFn } from '@angular/router';
import { SetupStore } from '@core/stores/setup-store';

/**
 * A route only admins open (the Product page while it is new): it reads Setup's `canEdit`, the API's word on whether the
 * person is an admin, once when the app has not read it yet. Anyone else, or a read that failed, goes to Needs you.
 * The API refuses the page's calls to anyone else too, so this only keeps a dead end out of sight.
 */
export const adminOnly: CanMatchFn = async () => {
  const setup = inject(SetupStore);
  const router = inject(Router);
  if (setup.setup() === null) await setup.load();
  return setup.setup()?.canEdit === true ? true : router.parseUrl('/');
};
