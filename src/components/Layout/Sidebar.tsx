import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function Sidebar() {
  const { t } = useTranslation();
  
  return (
    <aside className="layout-sidebar">
      <div className="layout-sidebar-title">Navigation</div>
      <NavLink 
        to="/games" 
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
      >
        {t('nav.games')}
      </NavLink>
      <div className="layout-sidebar-title">{t('nav.deploy')}</div>
      <div className="sidebar-group">
        <NavLink 
          to="/deploy" 
          className={({ isActive }) => `sidebar-link sidebar-sublink ${isActive ? 'active' : ''}`}
        >
          {t('nav.deploySegatools')}
        </NavLink>
      </div>
      <div className="layout-sidebar-title">{t('nav.editor')}</div>
      <div className="sidebar-group">
        <NavLink 
          to="/config" 
          className={({ isActive }) => `sidebar-link sidebar-sublink ${isActive ? 'active' : ''}`}
        >
          {t('nav.editorIni')}
        </NavLink>
        <NavLink 
          to="/json" 
          className={({ isActive }) => `sidebar-link sidebar-sublink ${isActive ? 'active' : ''}`}
        >
          {t('nav.editorJson')}
        </NavLink>
      </div>
      <div className="layout-sidebar-title">{t('nav.manage')}</div>
      <div className="sidebar-group">
        <NavLink 
          to="/manage/data" 
          className={({ isActive }) => `sidebar-link sidebar-sublink ${isActive ? 'active' : ''}`}
        >
          {t('nav.manageData')}
        </NavLink>
        <NavLink 
          to="/manage/mods" 
          className={({ isActive }) => `sidebar-link sidebar-sublink ${isActive ? 'active' : ''}`}
        >
          {t('nav.manageMods')}
        </NavLink>
      </div>
      <div className="layout-sidebar-title">{t('nav.settings')}</div>
      <div className="sidebar-group">
        <NavLink 
          to="/settings" 
          className={({ isActive }) => `sidebar-link sidebar-sublink ${isActive ? 'active' : ''}`}
        >
          {t('nav.settings')}
        </NavLink>
      </div>
    </aside>
  );
}

export default Sidebar;
