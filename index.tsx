
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';

// Dev-only: mirror browser console to the dev terminal. The static
// import.meta.env.DEV guard makes this dead code (stripped) in prod builds.
if (import.meta.env.DEV) {
  import('./utils/devLog').then(m => m.installDevLogBridge());
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
