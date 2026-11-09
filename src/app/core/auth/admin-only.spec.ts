import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { describe, expect, it } from 'vitest';
import type { Setup } from '@core/api/types';
import { SetupStore } from '@core/stores/setup-store';
import getSetup from '@testing/fixtures/getSetup.json';
import { adminOnly } from './admin-only';

/** A Setup store that answers `canEdit` after `reads` reads, counting them. */
function fakeSetup(answer: boolean | null) {
  const setup = signal<Setup | null>(null);
  let reads = 0;
  return {
    store: {
      setup,
      load: () => {
        reads++;
        if (answer !== null)
          setup.set({ ...(getSetup as Setup), canEdit: answer });
        return Promise.resolve();
      },
    },
    reads: () => reads,
    setup,
  };
}

async function decide(fake: ReturnType<typeof fakeSetup>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SetupStore, useValue: fake.store },
    ],
  });
  return TestBed.runInInjectionContext(() =>
    adminOnly({ path: 'product' }, [], undefined as never)
  );
}

describe('adminOnly', () => {
  it('lets an admin in, reading Setup once when the app has not yet', async () => {
    const fake = fakeSetup(true);
    expect(await decide(fake)).toBe(true);
    expect(fake.reads()).toBe(1);
  });

  it('sends anyone else to Needs you, and so a read that failed', async () => {
    for (const answer of [false, null]) {
      TestBed.resetTestingModule();
      const result = await decide(fakeSetup(answer));
      expect(result).toBeInstanceOf(UrlTree);
      expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
    }
  });

  it('does not read Setup again when the app already has it', async () => {
    const fake = fakeSetup(true);
    fake.setup.set({ ...(getSetup as Setup), canEdit: true });
    expect(await decide(fake)).toBe(true);
    expect(fake.reads()).toBe(0);
  });
});
