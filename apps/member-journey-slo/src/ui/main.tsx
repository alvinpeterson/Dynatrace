import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRoot } from '@dynatrace/strato-components/core';
import App from './app/App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppRoot>
      <App />
    </AppRoot>
  </React.StrictMode>,
);
