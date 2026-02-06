import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import './Dialog.css';

type Props = {
  title: string;
  message: string;
  onClose: () => void;
};

export function AlertDialog({ title, message, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <Modal title={title} onClose={onClose} width={400}>
      <p className="dialog-message">
        {message}
      </p>
      <div className="dialog-footer">
        <button 
          type="button" 
          onClick={onClose}
          className="dialog-btn action-btn btn-primary"
        >
          {t('common.confirm')}
        </button>
      </div>
    </Modal>
  );
}
