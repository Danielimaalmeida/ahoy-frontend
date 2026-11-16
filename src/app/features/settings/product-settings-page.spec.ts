import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE } from '@core/api/api-base';
import { buttonNamed, field, text, type } from '@testing/dom';
import { requestViolations } from '@testing/fixtures/contract';
import getProductSettings from '@testing/fixtures/getProductSettings.json';
import listProductSettingsEvents from '@testing/fixtures/listProductSettingsEvents.json';
import updateProductSettings from '@testing/fixtures/updateProductSettings.json';
import { ToastService } from '@ui/toast/toast';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProductSettingsPage } from './product-settings-page';

const BASE = '/api/v1';

describe('the Product section of Team settings', () => {
  let fixture: ComponentFixture<ProductSettingsPage>;
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
    http.expectOne({ method: 'GET', url: `${BASE}/settings/product` });
  const historyRead = () =>
    http.expectOne(
      (r) => r.method === 'GET' && r.url === `${BASE}/settings/events`
    );

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE, useValue: BASE },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProductSettingsPage);
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    http.verify();
  });

  it('shows no defaults before a save, the team model with a link to Phases, and its own history', async () => {
    const history = historyRead();
    expect(history.request.params.get('section')).toBe('product');
    settingsRead().flush(getProductSettings);
    history.flush(listProductSettingsEvents);
    await settle();
    expect(field(root, 'Jira project').value).toBe('');
    expect(text(root)).toContain('Not saved yet');
    expect(text(root)).toContain('Model: claude-sonnet-5.');
    expect(
      root.querySelector('a[href="/settings/phases"]')?.textContent?.trim()
    ).toBe('Change it in Phases');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    expect(
      [...root.querySelectorAll('[aria-label="Changes to Product"] li')].map(
        (li) => text(li.querySelector('.history__text span'))
      )
    ).toEqual([
      'Jira project: none → PROJ; Confluence spaces: none → BILL, PROD; Repositories: none → web',
    ]);
  });

  it('refuses a bad project key as typed, then saves only what changed, upper-cased', async () => {
    settingsRead().flush(getProductSettings);
    historyRead().flush(listProductSettingsEvents);
    await settle();
    type(field(root, 'Jira project'), 'PROJ-1');
    await settle();
    expect(text(root)).toContain('A Jira project key, such as PROJ');
    expect(buttonNamed(root, 'Save').disabled).toBe(true);
    type(field(root, 'Jira project'), 'proj');
    type(field(root, 'Confluence spaces'), 'BILL, PROD, BILL');
    type(field(root, 'Repositories'), 'web');
    await settle();
    buttonNamed(root, 'Save').click();
    await settle();
    const patch = http.expectOne({
      method: 'PATCH',
      url: `${BASE}/settings/product`,
    });
    expect(patch.request.body).toEqual({
      jiraProject: 'PROJ',
      confluenceSpaces: ['BILL', 'PROD'],
      repositories: ['web'],
    });
    expect(
      requestViolations('updateProductSettings', patch.request.body)
    ).toEqual([]);
    patch.flush(updateProductSettings);
    await settle();
    settingsRead().flush(updateProductSettings);
    historyRead().flush(listProductSettingsEvents);
    await settle();
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((t) => t.text)
    ).toContain('Product defaults saved.');
    expect(field(root, 'Confluence spaces').value).toBe('BILL, PROD');
  });
});
