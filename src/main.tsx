import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { UpdateProvider } from './context/UpdateContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './i18n';
import './main.css';
import './components/common.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <UpdateProvider>
          <App />
        </UpdateProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
