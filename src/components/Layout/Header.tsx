import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
      <div className="titlebar-actions">
        <button
          type="button"
          className="titlebar-button"
          onClick={() => appWindow.minimize()}
          aria-label="Minimize"
        >
          -
        </button>
        <button
          type="button"
          className="titlebar-button"
          onClick={() => appWindow.toggleMaximize()}
          aria-label="Maximize"
        >
          []
        </button>
        <button
          type="button"
          className="titlebar-button close"
          onClick={() => appWindow.close()}
          aria-label="Close"
        >
          x
        </button>
      </div>
    </header>
  );
}

export default Header;
