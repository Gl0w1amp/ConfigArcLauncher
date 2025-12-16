import { useTranslation } from 'react-i18next';

function Header() {
  const { t } = useTranslation();

  return (
    <header className="layout-header">
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <h1 className="layout-title">{t('common.appName')}</h1>
      </div>
    </header>
  );
}

export default Header;
