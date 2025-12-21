import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { UpdateProvider } from './context/UpdateContext';
import './i18n';
import './main.css';
import './components/common.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <UpdateProvider>
        <App />
      </UpdateProvider>
    </ThemeProvider>
  </React.StrictMode>
);
