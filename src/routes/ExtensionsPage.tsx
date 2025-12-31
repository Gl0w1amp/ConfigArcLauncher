import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useExtensions } from '../context/ExtensionsContext';
import './ExtensionsPage.css';

function ExtensionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { extensions, isEnabled } = useExtensions();

  const utilities = useMemo(
    () => extensions.filter((extension) => extension.category === 'utility'),
    [extensions],
  );

  if (utilities.length === 0) {
    return (
      <div className="empty-state">
        <h3>{t('utilities.emptyTitle')}</h3>
        <p>{t('utilities.emptySubtitle')}</p>
      </div>
    );
  }

  return (
    <div className="extensions-page">
      <div className="page-header">
        <div>
          <h2>{t('extensions.title')}</h2>
          <small>{t('extensions.subtitle')}</small>
        </div>
      </div>

      <div className="extensions-section">
        <div className="extensions-section-header">
          <h3>{t('utilities.title')}</h3>
          <small>{t('utilities.subtitle')}</small>
        </div>
        <div className="extensions-grid">
          {utilities.map((utility) => {
            const enabled = isEnabled(utility.id);
            return (
              <div key={utility.id} className={`utility-card ${enabled ? '' : 'is-disabled'}`}>
                <div className="utility-card-header">
                  <h3>{t(utility.titleKey)}</h3>
                  {!enabled && (
                    <span className="utility-status">{t('extensions.disabled')}</span>
                  )}
                </div>
                {utility.descriptionKey && (
                  <p className="utility-description">{t(utility.descriptionKey)}</p>
                )}
                <div className="utility-actions">
                  <button
                    type="button"
                    className="utility-action"
                    onClick={() => navigate(enabled ? utility.route : '/settings')}
                  >
                    {enabled ? t('extensions.open') : t('extensions.enableInSettings')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ExtensionsPage;
