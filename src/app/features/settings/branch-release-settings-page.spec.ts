import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { API_BASE } from '@core/api/api-base';
import {
  buttonNamed,
  dialog,
  field,
  removeOverlays,
  text,
  type,
} from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import addBranchReleaseRepository from '@testing/fixtures/addBranchReleaseRepository.json';
import getBranchReleaseSettings from '@testing/fixtures/getBranchReleaseSettings.json';
import listBranchReleaseSettingsEvents from '@testing/fixtures/listBranchReleaseSettingsEvents.json';
import updateBranchReleaseRepository from '@testing/fixtures/updateBranchReleaseRepository.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BranchReleaseSettingsPage } from './branch-release-settings-page';

const BASE = '/api/v1';
const ROW = getBranchReleaseSettings.repositories[0]!;

describe('the Branch releases section of Team settings', () => {
  let fixture: ComponentFixture<BranchReleaseSettingsPage>;
  let http: HttpTestingController;
  let root: HTMLElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  const settingsRead = () =>
    http.expectOne({ method: 'GET', url: `${BASE}/settings/branch-releases` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  async function answer(
    page: object = getBranchReleaseSettings
  ): Promise<void> {
    settingsRead().flush(page);
    historyRead().flush(listBranchReleaseSettingsEvents);
    await settle();
  }

  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((t) => t.text);

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BranchReleaseSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    removeOverlays();
    http.verify();
  });

  it('lists each repository with its workflow and inputs, and its own history', async () => {
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('branch_releases');
    settingsRead().flush(getBranchReleaseSettings);
    history.flush(listBranchReleaseSettingsEvents);
    await settle();
    const row = text(root.querySelector('tbody tr'));
    expect(row).toContain('example/web-app');
    expect(row).toContain('branch-release.yaml');
    expect(row).toContain('environment=test · update-ops-tag=true');
    expect(text(root)).toContain(
      'Gave example/web-app the release workflow branch-release.yaml (environment=test · update-ops-tag=true)'
    );
    expect(text(root)).not.toContain('cannot start workflows');
  });

  it('adds a repository with its inputs as typed, case kept', async () => {
    await answer();
    buttonNamed(root, 'Add repository').click();
    await settle();
    type(field(dialog(), 'Repository'), ' example/api ');
    type(
      field<HTMLTextAreaElement>(dialog(), 'Inputs'),
      'environment=TEST\nupdate-ops-tag=true'
    );
    await settle();
    buttonNamed(dialog(), 'Add repository').click();
    await settle();
    const post = http.expectOne({
      method: 'POST',
      url: `${BASE}/settings/branch-releases/repositories`,
    });
    expect(post.request.body).toEqual({
      repository: 'example/api',
      workflow: 'branch-release.yaml',
      inputs: { environment: 'TEST', 'update-ops-tag': 'true' },
    });
    expect(
      requestViolations('addBranchReleaseRepository', post.request.body)
    ).toEqual([]);
    post.flush(addBranchReleaseRepository, { status: 201, statusText: 'OK' });
    await settle();
    await answer();
    expect(toasts()).toContain(
      'example/api releases its branches with branch-release.yaml.'
    );
  });

  it('refuses inputs it cannot read before sending anything', async () => {
    await answer();
    buttonNamed(root, 'Add repository').click();
    await settle();
    type(field(dialog(), 'Repository'), 'example/api');
    type(field<HTMLTextAreaElement>(dialog(), 'Inputs'), 'environment');
    await settle();
    expect(text(dialog())).toContain('Line 1: write name=value.');
    expect(buttonNamed(dialog(), 'Add repository').disabled).toBe(true);
  });

  it('sends only the inputs when they change, with the version it read', async () => {
    await answer();
    buttonNamed(root, 'Edit example/web-app').click();
    await settle();
    type(
      field<HTMLTextAreaElement>(dialog(), 'Inputs'),
      'environment=int\nupdate-ops-tag=true'
    );
    await settle();
    buttonNamed(dialog(), 'Save').click();
    await settle();
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/branch-releases/repositories/${ROW.id}`,
    });
    expect(patch.request.body).toEqual({
      version: 1,
      inputs: { environment: 'int', 'update-ops-tag': 'true' },
    });
    patch.flush(updateBranchReleaseRepository);
    await settle();
    await answer();
  });

  it('reads only, and says when the deployment cannot start workflows', async () => {
    await answer({
      ...getBranchReleaseSettings,
      canEdit: false,
      dispatchable: false,
    });
    expect(text(root)).toContain('Only admins change these');
    expect(text(root)).toContain('This deployment cannot start workflows');
    expect(() => buttonNamed(root, 'Add repository')).toThrow();
  });
});
