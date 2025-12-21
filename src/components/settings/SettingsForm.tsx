import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { useUpdate } from '../../context/UpdateContext';
import { AUTO_UPDATE_STORAGE_KEY } from '../../constants/storage';

function SettingsForm() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { checkForUpdates, isChecking } = useUpdate();
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(
    () => localStorage.getItem(AUTO_UPDATE_STORAGE_KEY) === '1'
  );
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

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

  const handleCheckUpdate = async () => {
    setCheckMessage(null);
    const hasUpdate = await checkForUpdates(true);
    if (!hasUpdate) {
      setCheckMessage(t('updater.noUpdate', 'No updates available'));
      setTimeout(() => setCheckMessage(null), 3000);
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
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--spacing-md)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-md)',
            background: 'var(--bg-tertiary)'
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>{t('settings.autoUpdate.title')}</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: '0.85rem' }}>
              {t('settings.autoUpdate.desc')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoUpdateEnabled}
            onChange={(e) => setAutoUpdate(e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--spacing-md)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-md)',
            background: 'var(--bg-tertiary)'
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>{t('updater.checkUpdate', 'Check for Updates')}</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: '0.85rem' }}>
              {checkMessage || t('updater.checkUpdateDesc', 'Check if a new version is available')}
            </div>
          </div>
          <button
            onClick={handleCheckUpdate}
            disabled={isChecking}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--accent-primary)',
              color: 'white',
              cursor: isChecking ? 'wait' : 'pointer',
              opacity: isChecking ? 0.7 : 1,
              fontWeight: 500,
              minWidth: 100
            }}
          >
            {isChecking ? t('updater.checking', 'Checking...') : t('updater.check', 'Check Now')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsForm;
