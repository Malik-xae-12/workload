import { StrictMode } from 'react';
import { bootstrap } from '@ms-fabric/workload-client';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { Toaster } from 'sonner';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msalConfig } from './features/auth/config/msalConfig'; 
import { authService } from './features/auth/services/authService';
import { FabricLoader } from './shared/components/FabricLoader';
import './shared/styles/index.css';

const msalInstance = new PublicClientApplication(msalConfig);

const rootEl = document.getElementById('root')!;
const root = createRoot(rootEl);

function renderApp() {
  root.render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
        <Toaster position="top-center" richColors closeButton />
      </MsalProvider>
    </StrictMode>,
  );
}

function renderLoader() {
  root.render(
    <StrictMode>
      <FabricLoader />
    </StrictMode>,
  );
}

// Initialize MSAL and render the application
msalInstance.initialize().then(async () => {
  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response && response.idToken) {
      renderLoader();
      const tokenPair = await authService.entraIdExchange(response.idToken);
      localStorage.setItem('access_token', tokenPair.access_token);
      localStorage.setItem('refresh_token', tokenPair.refresh_token);
      window.location.replace('/setup');
      return;
    }
  } catch (e) {
    console.error('MSAL redirect/token exchange error:', e);
  }
  renderApp();
}).catch((err) => {
  console.error('MSAL initialization failed, rendering app anyway:', err);
  renderApp();
});
