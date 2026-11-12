import { TestBed } from '@angular/core/testing';
import { FedevAuthService, MockAuthService } from '@acme-fedev/auth';
import { environment } from '../environments/environment';
import { createAppConfig, LOCAL_USER } from './app.config';

describe('createAppConfig', () => {
  it('signs in the local user through the auth library mock when the environment asks for it', () => {
    TestBed.configureTestingModule({
      providers: createAppConfig({ ...environment, mockAuth: true }).providers,
    });
    const auth = TestBed.inject(FedevAuthService);
    expect(auth).toBeInstanceOf(MockAuthService);
    expect(auth.isUserAuthenticated()).toBe(true);
    expect(auth.userProfile()?.['given_name']).toBe(LOCAL_USER.given_name);
  });

  it('refuses the mock sign-in in a production environment', () => {
    expect(() =>
      createAppConfig({ ...environment, production: true, mockAuth: true })
    ).toThrow('MOCK_AUTH_IN_PRODUCTION');
  });

  it('keeps the real sign-in otherwise', () => {
    TestBed.configureTestingModule({
      providers: createAppConfig({ ...environment, mockAuth: false }).providers,
    });
    expect(TestBed.inject(FedevAuthService)).not.toBeInstanceOf(
      MockAuthService
    );
  });
});
