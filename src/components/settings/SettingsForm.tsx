import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { AUTO_UPDATE_STORAGE_KEY } from '../../constants/storage';

function SettingsForm() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(
    () => localStorage.getItem(AUTO_UPDATE_STORAGE_KEY) === '1'
  );

  const changeLanguage = (lang: string) => {
    if (lang === 'system') {
      localStorage.removeItem('i18nextLng');
      window.location.reload();
    } else {
      i18n.changeLanguage(lang);
    }
  };

  // Determine current selection. If i18nextLng is not in localStorage, it's likely system.
  // However, i18next-browser-languagedetector might set it.
  // A better way is to check if we have a stored preference.
  // But for simplicity, let's assume if i18n.resolvedLanguage matches what we set, it's that.
  // To properly support "System", we need to know if the user explicitly set it.
  // Since we can't easily know without checking localStorage directly:
  const currentLang = localStorage.getItem('i18nextLng') ? i18n.resolvedLanguage : 'system';

  const setAutoUpdate = (enabled: boolean) => {
    setAutoUpdateEnabled(enabled);
    if (enabled) {
      localStorage.setItem(AUTO_UPDATE_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(AUTO_UPDATE_STORAGE_KEY);
    }
  };

  return (
    <div style={{ 
      border: '1px solid var(--border-color)', 
      padding: 'var(--spacing-md)', 
      borderRadius: 'var(--radius-md)', 
      background: 'var(--bg-secondary)' 
    }}>
      <h3 style={{ marginBottom: 'var(--spacing-md)' }}>{t('settings.appearance')}</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
        {[
          { id: 'system', label: t('settings.theme.system') },
          { id: 'light', label: t('settings.theme.light') },
          { id: 'dark', label: t('settings.theme.dark') }
        ].map((option) => (
          <div
            key={option.id}
            onClick={() => setTheme(option.id as any)}
            style={{
              cursor: 'pointer',
              border: theme === option.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--spacing-md)',
              textAlign: 'center',
              background: theme === option.id ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)',
              color: theme === option.id ? 'var(--accent-primary)' : 'var(--text-primary)',
              transition: 'all 0.2s ease',
              fontWeight: 600
            }}
          >
            {option.label}
          </div>
        ))}
      </div>

      <h3 style={{ marginBottom: 'var(--spacing-md)' }}>{t('settings.language')}</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--spacing-md)' }}>
        {[
          { id: 'system', label: t('settings.lang.system') },
          { id: 'en', label: t('settings.lang.en') },
          { id: 'zh', label: t('settings.lang.zh') },
          { id: 'ja', label: t('settings.lang.ja') }
        ].map((option) => {
          const isActive = option.id === 'system' 
            ? !localStorage.getItem('i18nextLng') 
            : localStorage.getItem('i18nextLng') === option.id || (localStorage.getItem('i18nextLng')?.startsWith(option.id) && option.id !== 'en'); // Simple check

          // Better active check:
          // If system: check if localStorage 'i18nextLng' is missing (or we cleared it).
          // If specific lang: check if i18n.resolvedLanguage starts with it AND localStorage has it.
          
          // Actually, i18next-browser-languagedetector sets 'i18nextLng' in localStorage automatically when it detects.
          // So "System" implies we want to let it detect. But if we changeLanguage, it updates that storage.
          // So to support "System" button, we need to clear that storage and reload.
          // And to know if we are in "System" mode, we might need to check if the storage was set by us or detector?
          // The detector overwrites it.
          
          // Let's use a different key for manual override if we want to be precise, but standard practice with i18next is:
          // If user picks a language, we set it.
          // If user picks "System", we remove the setting.
          // BUT the detector will immediately write it back upon init.
          
          // So, we can't easily distinguish "System detected en" vs "User selected en" if we just look at localStorage 'i18nextLng'.
          // However, for the UI highlight, we can just highlight the current resolved language.
          // If we want a distinct "System" button, we might need to store a separate flag "userLanguage" in localStorage.
          
          // Let's try a simpler approach: Just show available languages. "System" might be confusing if it just selects one of them anyway.
          // But the user asked for "System".
          
          // Let's implement "System" as: Clear 'i18nextLng' and reload.
          // And for highlighting:
          // If we have a custom flag 'app_language_preference', use that.
          // If not, highlight "System".
          
          return (
            <div
              key={option.id}
              onClick={() => {
                if (option.id === 'system') {
                   localStorage.removeItem('i18nextLng');
                   // We can also remove our custom flag if we use one
                   localStorage.removeItem('user_language_preference');
                   window.location.reload();
                } else {
                   i18n.changeLanguage(option.id);
                   localStorage.setItem('user_language_preference', option.id);
                }
              }}
              style={{
                cursor: 'pointer',
                border: (option.id === 'system' ? !localStorage.getItem('user_language_preference') : localStorage.getItem('user_language_preference') === option.id) 
                  ? '2px solid var(--accent-primary)' 
                  : '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-md)',
                textAlign: 'center',
                background: (option.id === 'system' ? !localStorage.getItem('user_language_preference') : localStorage.getItem('user_language_preference') === option.id)
                  ? 'rgba(59, 130, 246, 0.1)' 
                  : 'var(--bg-tertiary)',
                color: (option.id === 'system' ? !localStorage.getItem('user_language_preference') : localStorage.getItem('user_language_preference') === option.id)
                  ? 'var(--accent-primary)' 
                  : 'var(--text-primary)',
                transition: 'all 0.2s ease',
                fontWeight: 600
              }}
            >
              {option.label}
            </div>
          );
        })}
      </div>

      <h3 style={{ marginBottom: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)' }}>{t('settings.updates')}</h3>
      
      <div style={{ 
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-tertiary)',
        padding: 'var(--spacing-sm) var(--spacing-md)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--spacing-md)',
        minHeight: '56px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer' }}
            onClick={() => setAutoUpdate(!autoUpdateEnabled)}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(59, 130, 246, 0.1)',
              color: 'var(--accent-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
            </div>
            <span style={{ fontWeight: 500 }}>{t('settings.autoUpdate.title')}</span>
          </div>
        </div>

        <div style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
          <input
            type="checkbox"
            checked={autoUpdateEnabled}
            onChange={(e) => setAutoUpdate(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0 }}
            id="auto-update-switch"
          />
          <label
            htmlFor="auto-update-switch"
            style={{
              position: 'absolute',
              cursor: 'pointer',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: autoUpdateEnabled ? 'var(--accent-primary)' : 'var(--text-muted)',
              transition: '.3s',
              borderRadius: 34,
              opacity: autoUpdateEnabled ? 1 : 0.3
            }}
          >
            <span style={{
              position: 'absolute',
              content: '""',
              height: 14,
              width: 14,
              left: 3,
              bottom: 3,
              backgroundColor: 'white',
              transition: '.3s',
              borderRadius: '50%',
              transform: autoUpdateEnabled ? 'translateX(16px)' : 'translateX(0)'
            }} />
          </label>
        </div>
      </div>
    </div>
  );
}

export default SettingsForm;
