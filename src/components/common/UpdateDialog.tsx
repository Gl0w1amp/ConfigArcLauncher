import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import './Dialog.css';
import { Update } from '@tauri-apps/plugin-updater';

type Props = {
  updateInfo: Update;
  installing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractChangelogSection = (content: string, version: string) => {
  const safeVersion = escapeRegExp(version.trim());
  if (!safeVersion) return content.trim();
  const heading = new RegExp(`^##\\s*\\[?v?${safeVersion}\\]?(?:\\s*-.*)?$`, 'mi');
  const match = heading.exec(content);
  if (!match) return content.trim();
  const start = match.index;
  const after = content.slice(start + match[0].length);
  const next = after.search(/^##\\s+/m);
  const end = next === -1 ? content.length : start + match[0].length + next;
  return content.slice(start, end).trim();
};

export function UpdateDialog({ 
  updateInfo, 
  installing, 
  onConfirm, 
  onCancel 
}: Props) {
  const { t } = useTranslation();

  const resolvedChangelog = useMemo(() => {
    const body = updateInfo.body?.trim() ?? '';
    if (!body) return '';
    return extractChangelogSection(body, updateInfo.version);
  }, [updateInfo.body, updateInfo.version]);

  const changelogBody = resolvedChangelog;
  
  return (
    <Modal title={t('updater.title')} onClose={onCancel} width={500}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        <div style={{ display: 'flex', alignItems: 'start', gap: 'var(--spacing-md)' }}>
          <div style={{ 
            width: 48, 
            height: 48, 
            borderRadius: '12px', 
            background: 'rgba(59, 130, 246, 0.1)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'var(--accent-primary)',
            fontSize: '24px',
            flexShrink: 0
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </div>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>v{updateInfo.version}</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {t('updater.message', { version: updateInfo.version })}
            </p>
          </div>
        </div>

        {changelogBody && (
          <div style={{ 
            background: 'var(--bg-tertiary)', 
            padding: 'var(--spacing-md)', 
            borderRadius: 'var(--radius-md)',
            maxHeight: '250px',
            overflowY: 'auto',
            fontSize: '0.9rem',
            whiteSpace: 'pre-wrap',
            border: '1px solid var(--border-color)',
            fontFamily: 'monospace'
          }}>
            {changelogBody}
          </div>
        )}

        <div className="dialog-footer" style={{ marginTop: 'var(--spacing-sm)' }}>
          <button 
            type="button" 
            onClick={onCancel}
            className="dialog-btn action-btn btn-secondary"
            disabled={installing}
          >
            {t('updater.cancel')}
          </button>
          <button 
            type="button" 
            onClick={onConfirm}
            className="dialog-btn action-btn btn-primary"
            disabled={installing}
            style={{ minWidth: 90 }}
          >
            {installing ? (
              <>
                <span className="spinner-small" style={{ marginRight: 8 }}></span>
                {t('updater.installing')}
              </>
            ) : (
              t('updater.confirm')
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
