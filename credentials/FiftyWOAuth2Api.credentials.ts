import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

/** Let n8n register a public PKCE client with 550W for its exact callback URI. */
export class FiftyWOAuth2Api implements ICredentialType {
  name = 'fiftyWOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = '550W AI OAuth2 API';
  icon: Icon = { light: 'file:../nodes/FiftyW/icon.svg', dark: 'file:../nodes/FiftyW/icon.svg' };
  documentationUrl = 'https://eraser.550wai.com/agent/';
  properties: INodeProperties[] = [
    { displayName: 'Use Dynamic Client Registration', name: 'useDynamicClientRegistration',
      type: 'hidden', default: true },
    { displayName: 'Server URL', name: 'serverUrl', type: 'hidden',
      default: 'https://www.550wai.cn/mcp/global' },
    { displayName: 'Resource URL', name: 'resourceUrl', type: 'hidden',
      default: 'https://www.550wai.cn/mcp/global' },
    { displayName: 'Scope', name: 'scope', type: 'hidden',
      default: 'mcp:read credits:read tasks:read tasks:submit media:upload' },
  ];
}
