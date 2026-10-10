import { TestBed } from '@angular/core/testing';
import { AppConfigStore, DEFAULT_APP_CONFIG } from '@core/config/app-config';
import { API_BASE, trimBase } from './api-base';

describe('API_BASE', () => {
  it('is /api/v1 until the configuration says otherwise (F9)', () => {
    expect(TestBed.inject(API_BASE)).toBe('/api/v1');
  });

  it('comes from AppConfig.apiBase, the value `initAppConfig` left in the store', () => {
    TestBed.inject(AppConfigStore).set({
      ...DEFAULT_APP_CONFIG,
      apiBase: '/ahoy/api/v1',
    });
    expect(TestBed.inject(API_BASE)).toBe('/ahoy/api/v1');
  });
});

describe('trimBase', () => {
  it.each([
    ['/api/v1', '/api/v1'],
    ['/api/v1/', '/api/v1'],
    ['/api/v1///', '/api/v1'],
    ['', ''],
  ])('turns %s into %s', (base, expected) => {
    expect(trimBase(base)).toBe(expected);
  });
});
