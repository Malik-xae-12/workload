import { Configuration } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_AZURE_AD_CLIENT_ID || 'your_client_id_here';
const tenantId = import.meta.env.VITE_AZURE_AD_TENANT_ID || 'common';

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
};

export const loginRequest = {
  scopes: ['User.Read', 'email', 'profile', 'openid'],
};

export const fabricTokenRequest = {
  scopes: ['https://api.fabric.microsoft.com/.default'],
};
