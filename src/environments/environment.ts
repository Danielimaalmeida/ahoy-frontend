const host = 'http://localhost:4200';
const oauth2Host = 'http://localhost:4200';

export const environment = {
  name: 'DEV',
  production: false,
  issuer: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha`,
  redirectUri: `${host}`,
  clientId: `b89c6dd6-3640-47fd-9463-f336aaaaf070`,
  silentRefreshRedirectUri: `${host}/ui/oauth/silent-refresh.html`,
  postLogoutRedirectUri: `${host}`,
  showDebugInformation: true,
  skipIssuerCheck: true,
  useHttpBasicAuth: false,
  callDiscoveryDocument: false,
  setupAutomaticSilentRefresh: true,
  loginUrl: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/authorize`,
  logoutUrl: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/connect/endSession`,
  tokenEndpoint: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/access_token`,
  userinfoEndpoint: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/userinfo`,
  sessionCheckIFrameUrl: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/connect/checkSession`,
  revocationEndpoint: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/token/revoke`,
  strictDiscoveryDocumentValidation: false,
  scope: 'openid profile email groups',
  devRoutes: [
    {
      path: '_kit',
      title: 'Kit · Ahoy',
      loadChildren: () =>
        import('@ui/_kit/kit.routes').then((m) => m.KIT_ROUTES),
    },
  ],
};
