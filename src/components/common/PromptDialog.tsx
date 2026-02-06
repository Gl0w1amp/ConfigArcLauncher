import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import './Dialog.css';

type Props = {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function PromptDialog({ 
  title, 
  label,
  defaultValue = '', 
  placeholder = '',
  confirmLabel, 
  cancelLabel, 
  onConfirm, 
  onCancel 
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value);
    }
  };

  return (
    <Modal title={title} onClose={onCancel} width={400}>
      <form onSubmit={handleSubmit}>
        {label && <label className="dialog-label">{label}</label>}
        <input
          ref={inputRef}
          type="text"
          className="dialog-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
        />
        <div className="dialog-footer">
          <button 
            type="button" 
            onClick={onCancel}
            className="dialog-btn action-btn btn-secondary"
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button 
            type="submit" 
            disabled={!value.trim()}
            className="dialog-btn action-btn btn-primary"
            style={!value.trim() ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            {confirmLabel || t('common.confirm')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
