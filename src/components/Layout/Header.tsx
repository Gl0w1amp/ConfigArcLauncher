import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';

const iconProps = {
  viewBox: '0 0 24 24',
  'aria-hidden': true,
};

function IconMinimize() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 15h12" />
    </svg>
  );
}

function IconMaximize() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M7 7l10 10" />
      <path d="M17 7l-10 10" />
    </svg>
  );
}

function Header() {
  const { t } = useTranslation();
  const appWindow = getCurrentWindow();

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-drag" data-tauri-drag-region>
        <div className="titlebar-brand">
          <span className="titlebar-mark" aria-hidden="true" />
          <span className="titlebar-text">{t('common.appName')}</span>
        </div>
      </div>
      <div className="titlebar-actions" data-tauri-drag-region="false">
        <button
          type="button"
          className="titlebar-button"
          onClick={() => appWindow.minimize()}
          aria-label="Minimize"
        >
          <IconMinimize />
        </button>
        <button
          type="button"
          className="titlebar-button"
          onClick={() => appWindow.toggleMaximize()}
          aria-label="Maximize"
        >
          <IconMaximize />
        </button>
        <button
          type="button"
          className="titlebar-button close"
          onClick={() => appWindow.close()}
          aria-label="Close"
        >
          <IconClose />
        </button>
      </div>
    </header>
  );
}

export default Header;
