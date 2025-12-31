import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const iconProps = {
  viewBox: '0 0 24 24',
  'aria-hidden': true,
};

function IconPlug() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 7v6" />
      <path d="M15 7v6" />
      <path d="M7 9h10" />
      <path d="M12 13v5" />
    </svg>
  );
}

function IconPulse() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h4l2-4 3 8 2-4h5" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.8-2 2.1-2 3.5" />
      <circle cx="12" cy="16.5" r="0.7" />
    </svg>
  );
}

function RightRail() {
  const { t } = useTranslation();
  const items = [
    { id: 'extensions', label: t('extensions.title'), icon: <IconPlug />, to: '/extensions' },
    { id: 'status', label: t('rail.status'), icon: <IconPulse /> },
    { id: 'help', label: t('rail.help'), icon: <IconHelp /> },
  ];

  return (
    <aside className="app-rail">
      <div className="app-rail-stack">
        {items.map((item) => (
          item.to ? (
            <NavLink
              key={item.id}
              to={item.to}
              className={({ isActive }) => `app-rail-button app-rail-link ${isActive ? 'active' : ''}`}
              title={item.label}
              aria-label={item.label}
            >
              {item.icon}
            </NavLink>
          ) : (
            <button
              key={item.id}
              type="button"
              className="app-rail-button"
              title={item.label}
              aria-label={item.label}
              disabled
            >
              {item.icon}
            </button>
          )
        ))}
      </div>
    </aside>
  );
}

export default RightRail;
