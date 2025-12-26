import './config.css';
import { VK_MAP, mapKeyToVK } from '../../utils/vkCodes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../common/ConfirmDialog';

type Props = {
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'key';
  value: any;
  onChange: (val: any) => void;
  helper?: string;
  description?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  commented?: boolean;
  onUncomment?: () => void;
  allowDrop?: boolean;
};

function OptionField({ label, type, value, onChange, helper, description, required, options, commented, onUncomment, allowDrop }: Props) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [showUncommentConfirm, setShowUncommentConfirm] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const canDrop = Boolean(allowDrop && type === 'text' && !commented);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canDrop) return;
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    const paths = files
      .map((f: any) => (f.path as string) || '')
      .filter((p) => p.length > 0);
    if (paths.length === 0) return;
    onChange(paths[0]);
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canDrop) return;
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => {
    if (!canDrop) return;
    setIsDragOver(false);
  };

  const handleCommentedClick = (e: React.MouseEvent) => {
    if (commented) {
      e.preventDefault();
      e.stopPropagation();
      if (onUncomment) {
        setShowUncommentConfirm(true);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (commented) return;
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();
    
    const vk = mapKeyToVK(e);
    if (vk !== null) {
      onChange(vk);
      setIsRecording(false);
    }
  };

  const renderInput = () => {
    const isMissing = required && (value === '' || value === null || value === undefined);
    const inputClass = `option-input ${isMissing ? 'missing-required' : ''} ${commented ? 'commented' : ''} ${isDragOver ? 'drop-target' : ''}`;
    const commonProps = {
        className: inputClass,
        readOnly: commented,
        disabled: commented && type === 'checkbox', // Checkbox needs disabled to prevent toggle, but we want to capture click?
        // Actually for checkbox, if disabled, click might not bubble.
        // Let's use onClickCapture on the wrapper or handle it carefully.
        onClick: handleCommentedClick,
        style: commented ? { opacity: 0.5, cursor: 'not-allowed' } : undefined
    };

    if (type === 'checkbox') {
      return (
        <div onClick={handleCommentedClick} style={{ display: 'inline-block' }}>
            <input
            type="checkbox"
            className="option-checkbox"
            checked={Boolean(value)}
            onChange={(e) => !commented && onChange(e.target.checked)}
            disabled={commented}
            style={commented ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : undefined}
            />
        </div>
      );
    }
    if (type === 'key') {
      const displayValue = isRecording 
        ? t('common.pressAnyKey')
        : (VK_MAP[value as number] ? `${VK_MAP[value as number]} (0x${(value as number).toString(16).toUpperCase()})` : `0x${(value as number || 0).toString(16).toUpperCase()}`);
      
      return (
        <input
          type="text"
          {...commonProps}
          className={`${inputClass} ${isRecording ? 'recording' : ''}`}
          value={displayValue}
          readOnly={true} // Always readOnly for key input
          onClick={(e) => {
              handleCommentedClick(e);
              if (!commented) setIsRecording(true);
          }}
          onBlur={() => setIsRecording(false)}
          onKeyDown={handleKeyDown}
          style={{ ...commonProps.style, cursor: commented ? 'not-allowed' : 'pointer', textAlign: 'center', caretColor: 'transparent' }}
        />
      );
    }
    if (type === 'number') {
      return (
        <input
          type="number"
          {...commonProps}
          value={value}
          onChange={(e) => !commented && onChange(Number(e.target.value))}
        />
      );
    }
    
    if (options && options.length > 0) {
      return (
        <div style={{ display: 'flex', gap: 8 }} onClick={commented ? handleCommentedClick : undefined}>
          <input
            type="text"
            {...commonProps}
            value={value ?? ''}
            onChange={(e) => !commented && onChange(e.target.value)}
            style={{ ...commonProps.style, flex: 1 }}
          />
          <select
            className="option-input"
            style={{ width: 'auto', paddingRight: 32, cursor: commented ? 'not-allowed' : 'pointer', opacity: commented ? 0.5 : 1 }}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
              e.target.value = '';
            }}
            value=""
            disabled={commented}
          >
            <option value="" disabled>Presets</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <input
        type="text"
        {...commonProps}
        value={value ?? ''}
        onChange={(e) => !commented && onChange(e.target.value)}
      />
    );
  };

  return (
    <label className="option-field">
      <div className="option-header">
        <span className="option-label">
          {label}
          {required && <span style={{ color: '#ef4444', marginLeft: '4px' }} title="Required">*</span>}
        </span>
        {helper && <small className="option-helper">{helper}</small>}
      </div>
      <div
        className="option-input-wrapper"
        onDragOver={canDrop ? handleDragOver : undefined}
        onDragLeave={canDrop ? handleDragLeave : undefined}
        onDrop={canDrop ? handleDrop : undefined}
      >
        {renderInput()}
        {description && (
          <div className="option-tooltip">
            {description}
          </div>
        )}
      </div>
      {showUncommentConfirm && (
        <ConfirmDialog
          title={t('common.uncommentTitle', 'Uncomment Value')}
          message={t('common.uncommentConfirm', 'This value is commented out. Do you want to uncomment it?')}
          onConfirm={() => {
            if (onUncomment) onUncomment();
            setShowUncommentConfirm(false);
          }}
          onCancel={() => setShowUncommentConfirm(false)}
        />
      )}
    </label>
  );
}

export default OptionField;
