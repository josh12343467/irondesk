import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { StoreProvider } from './lib/store';
import { CLOUD } from './lib/cloud/client';
import { CloudStoreProvider } from './lib/cloud/CloudStoreProvider';
import '@fontsource-variable/inter'; // self-hosted: no request to Google Fonts, so no visitor IPs shared with a third party
import './index.css';

// With VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set, the app runs against Supabase.
// Without them it runs the offline demo (fictional data in localStorage), e.g. for a portfolio link.
const Provider = CLOUD ? CloudStoreProvider : StoreProvider;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Provider>
        <App />
      </Provider>
    </HashRouter>
  </StrictMode>,
);
