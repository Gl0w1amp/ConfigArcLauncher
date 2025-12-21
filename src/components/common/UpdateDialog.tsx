import React from 'react';
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

export function UpdateDialog({ 
  updateInfo, 
  installing, 
  onConfirm, 
  onCancel 
}: Props) {
  const { t } = useTranslation();
  
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

        {updateInfo.body && (
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
            {updateInfo.body}
          </div>
        )}

        <div className="dialog-footer" style={{ marginTop: 'var(--spacing-sm)' }}>
          <button 
            type="button" 
            onClick={onCancel}
            className="dialog-btn dialog-btn-secondary"
            disabled={installing}
          >
            {t('updater.cancel')}
          </button>
          <button 
            type="button" 
            onClick={onConfirm}
            className="dialog-btn dialog-btn-primary"
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
