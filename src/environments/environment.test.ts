const host = 'https://neo-ahoy.apps.4wm-fpm-test.azure.cloud.company-name/';
const oauth2Host = 'https://emea.int.alpha.sso.company-namegroup.com:443';

export const environment = {
  name: 'TEST',
  production: false,
  apiBase: '/api/v1',
  issuer: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha`,
  redirectUri: `${host}`,
  clientId: `b89c6dd6-3640-47fd-9463-f336aaaaf070`,
  silentRefreshRedirectUri: `${host}/ui/oauth/silent-refresh.html`,
  postLogoutRedirectUri: `${host}`,
  showDebugInformation: true,
  skipIssuerCheck: true,
  useHttpBasicAuth: false,
  callDiscoveryDocument: false,
  loginUrl: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/authorize`,
  logoutUrl: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/connect/endSession`,
  tokenEndpoint: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/access_token`,
  userinfoEndpoint: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/userinfo`,
  sessionCheckIFrameUrl: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/connect/checkSession`,
  revocationEndpoint: `${oauth2Host}/auth/oauth2/realms/root/realms/alpha/token/revoke`,
  strictDiscoveryDocumentValidation: false,
  scope: 'openid profile email groups',
  devRoutes: [],
};
