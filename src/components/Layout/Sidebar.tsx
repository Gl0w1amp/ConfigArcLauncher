import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { useEffect, useState } from 'react';

const iconProps = {
  viewBox: '0 0 24 24',
  'aria-hidden': true,
};

function IconGames() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="10" rx="4" />
      <path d="M8 13h2" />
      <path d="M9 12v2" />
      <circle cx="15.5" cy="12.5" r="1" />
      <circle cx="17.5" cy="14.5" r="1" />
    </svg>
  );
}

function IconDeploySegatools() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 12h10" />
      <path d="M10 9l-3 3 3 3" />
      <path d="M14 15l3-3-3-3" />
      <rect x="4" y="5" width="16" height="14" rx="3" />
    </svg>
  );
}

function IconEditorIni() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </svg>
  );
}

function IconEditorJson() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6c-2 0-3 1-3 3v2c0 1-1 2-2 2 1 0 2 1 2 2v2c0 2 1 3 3 3" />
      <path d="M16 6c2 0 3 1 3 3v2c0 1 1 2 2 2-1 0-2 1-2 2v2c0 2-1 3-3 3" />
    </svg>
  );
}

function IconManageAime() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <rect x="6.5" y="12" width="4" height="3" rx="0.8" />
      <path d="M13.5 13.5h4" />
    </svg>
  );
}

function IconManageData() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8h12" />
      <path d="M7 4h10l1 4H6l1-4z" />
      <rect x="6" y="8" width="12" height="12" rx="2" />
      <path d="M10 12h4" />
    </svg>
  );
}

function IconManageMods() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="6" width="14" height="12" rx="2" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
      <path d="M19 9l2-2" />
      <path d="M19 15l2 2" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg {...iconProps} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12l2 0" />
      <path d="M3 12l2 0" />
      <path d="M12 3l0 2" />
      <path d="M12 19l0 2" />
      <path d="M17 7l1.5-1.5" />
      <path d="M5.5 18.5L7 17" />
      <path d="M17 17l1.5 1.5" />
      <path d="M5.5 5.5L7 7" />
    </svg>
  );
}

function Sidebar() {
  const { t } = useTranslation();
  const [version, setVersion] = useState('');

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion('0.1.0'));
  }, []);
  
  const navGroups = [
    [
      { to: '/games', label: t('nav.games'), icon: <IconGames /> },
    ],
    [
      { to: '/deploy', label: t('nav.deploySegatools'), icon: <IconDeploySegatools /> },
    ],
    [
      { to: '/config', label: t('nav.editorIni'), icon: <IconEditorIni /> },
      { to: '/json', label: t('nav.editorJson'), icon: <IconEditorJson /> },
    ],
    [
      { to: '/manage/aime', label: t('nav.manageAime'), icon: <IconManageAime /> },
      { to: '/manage/data', label: t('nav.manageData'), icon: <IconManageData /> },
      { to: '/manage/mods', label: t('nav.manageMods'), icon: <IconManageMods /> },
    ],
    [
      { to: '/settings', label: t('nav.settings'), icon: <IconSettings /> },
    ],
  ];

  return (
    <aside className="app-nav">
      <div className="app-nav-stack">
        {navGroups.map((group, groupIndex) => (
          <div className="app-nav-group" key={`nav-group-${groupIndex}`}>
            {group.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/deploy'}
                className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}
                aria-label={item.label}
                title={item.label}
              >
                <span className="app-nav-icon">{item.icon}</span>
              </NavLink>
            ))}
            {groupIndex < navGroups.length - 1 && <div className="app-nav-divider" />}
          </div>
        ))}
      </div>
      <div className="app-nav-footer">
        <span className="app-nav-version">v{version}</span>
      </div>
    </aside>
  );
}

export default Sidebar;
