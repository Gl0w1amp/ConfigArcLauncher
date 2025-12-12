import './config.css';
import { VK_MAP, mapKeyToVK } from '../../utils/vkCodes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'key';
  value: any;
  onChange: (val: any) => void;
  helper?: string;
  description?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
};

function OptionField({ label, type, value, onChange, helper, description, required, options }: Props) {
  const { t } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    const inputClass = `option-input ${isMissing ? 'missing-required' : ''}`;

    if (type === 'checkbox') {
      return (
        <input
          type="checkbox"
          className="option-checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    }
    if (type === 'key') {
      const displayValue = isRecording 
        ? t('common.pressAnyKey')
        : (VK_MAP[value as number] ? `${VK_MAP[value as number]} (0x${(value as number).toString(16).toUpperCase()})` : `0x${(value as number || 0).toString(16).toUpperCase()}`);
      
      return (
        <input
          type="text"
          className={`${inputClass} ${isRecording ? 'recording' : ''}`}
          value={displayValue}
          readOnly
          onClick={() => setIsRecording(true)}
          onBlur={() => setIsRecording(false)}
          onKeyDown={handleKeyDown}
          style={{ cursor: 'pointer', textAlign: 'center', caretColor: 'transparent' }}
        />
      );
    }
    if (type === 'number') {
      return (
        <input
          type="number"
          className={inputClass}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );
    }
    
    if (options && options.length > 0) {
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            className={inputClass}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            style={{ flex: 1 }}
          />
          <select
            className="option-input"
            style={{ width: 'auto', paddingRight: 32, cursor: 'pointer' }}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
              e.target.value = '';
            }}
            value=""
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
        className={inputClass}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
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
      <div className="option-input-wrapper">
        {renderInput()}
        {description && (
          <div className="option-tooltip">
            {description}
          </div>
        )}
      </div>
    </label>
  );
}

export default OptionField;
