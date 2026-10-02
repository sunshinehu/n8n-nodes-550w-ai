import type { Icon, ICredentialType, ICredentialTestRequest, INodeProperties } from 'n8n-workflow';
export class FiftyWOAuth2Api implements ICredentialType {
  name = 'fiftyWOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = '550W Media OAuth2 API';
  icon: Icon = { light: 'file:../nodes/FiftyW/icon.svg', dark: 'file:../nodes/FiftyW/icon.svg' };
  documentationUrl = 'https://eraser.550wai.com/agent/';
  test: ICredentialTestRequest = {
    request: { baseURL: 'https://www.550wai.cn/media-api/global/v1', url: '/account', method: 'GET' },
  };
  properties: INodeProperties[] = [
    { displayName: 'Connect using your 550W account. No API key or shared client secret is required. After upgrading from 3.1.4 or earlier, create a new credential to use automatic registration. Your n8n instance needs an HTTPS OAuth callback.', name: 'connectionNotice', type: 'notice', default: '' },
    { displayName: 'Use Dynamic Client Registration', name: 'useDynamicClientRegistration', type: 'hidden', default: true },
    { displayName: 'Server URL', name: 'serverUrl', type: 'hidden', default: 'https://www.550wai.cn/media-api/global' },
    { displayName: 'Grant Type', name: 'grantType', type: 'hidden', default: 'authorizationCode' },
    { displayName: 'Use PKCE', name: 'usePkce', type: 'hidden', default: true },
    { displayName: 'Authorization URL', name: 'authUrl', type: 'hidden', default: 'https://www.550wai.cn/oauth2/authorize' },
    { displayName: 'Access Token URL', name: 'accessTokenUrl', type: 'hidden', default: 'https://www.550wai.cn/oauth2/token' },
    { displayName: 'Authentication', name: 'authentication', type: 'hidden', default: 'body' },
    { displayName: 'Resource URL', name: 'resourceUrl', type: 'hidden', default: 'https://www.550wai.cn/media-api/global' },
    { displayName: 'Resource', name: 'resource', type: 'hidden', default: 'https://www.550wai.cn/media-api/global' },
    { displayName: 'Auth URI Query Parameters', name: 'authQueryParameters', type: 'hidden',
      default: 'resource=https%3A%2F%2Fwww.550wai.cn%2Fmedia-api%2Fglobal' },
    { displayName: 'Scope', name: 'scope', type: 'hidden', default: 'credits:read tasks:read tasks:submit media:upload' },
  ];
}
