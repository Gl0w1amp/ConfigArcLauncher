import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useExtensions } from '../../context/ExtensionsContext';
import { ExtensionDefinition } from '../../extensions/registry';
import './ExtensionRoute.css';

type Props = {
  extension: ExtensionDefinition;
};

function ExtensionRoute({ extension }: Props) {
  const { t } = useTranslation();
  const { isEnabled } = useExtensions();

  if (!isEnabled(extension.id)) {
    return (
      <div className="empty-state">
        <h3>{t('extensions.disabledTitle')}</h3>
        <p>{t('extensions.disabledBody', { name: t(extension.titleKey) })}</p>
        <Link className="extension-link" to="/settings">
          {t('extensions.openSettings')}
        </Link>
      </div>
    );
  }

  const Component = extension.component;
  return <Component />;
}

export default ExtensionRoute;
