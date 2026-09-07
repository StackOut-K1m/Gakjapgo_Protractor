// src/components/ui/TimeToggleField.tsx
import type { ChangeEvent } from 'react';
import styles from './TimeToggleField.module.css';

interface TimeToggleFieldProps {
  label: string;
  id: string;
  presets: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  unit?: string;
}

const CUSTOM = '__custom__';

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3.5 5.25L7 8.75L10.5 5.25"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function TimeToggleField({
  label,
  id,
  presets,
  value,
  onChange,
  unit = '분',
}: TimeToggleFieldProps) {
  const isCustom = !presets.some((p) => p.value === value);

  function handleSelectChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    onChange(v === CUSTOM ? '' : v);
  }

  return (
    <div className={styles['time-toggle-field']}>
      <label className={styles['time-toggle-label']} htmlFor={id}>
        {label}
      </label>

      <div className={styles['time-select-wrapper']}>
        <select
          id={id}
          value={isCustom ? CUSTOM : value}
          onChange={handleSelectChange}
          className={styles['time-select-control']}
        >
          {presets.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value={CUSTOM}>직접 입력...</option>
        </select>
        <span className={styles['time-select-chevron']}>
          <ChevronDownIcon />
        </span>
      </div>

      {isCustom && (
        <div className={styles['time-custom-row']}>
          <input
            type="number"
            min={1}
            max={999}
            value={value}
            placeholder="숫자 입력"
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} 직접 입력`}
            className={styles['time-custom-input']}
          />
          <span className={styles['time-unit-label']}>{unit}</span>
        </div>
      )}
    </div>
  );
}
