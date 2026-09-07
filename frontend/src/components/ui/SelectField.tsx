// src/components/ui/SelectField.tsx
import styles from './SelectField.module.css';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  id: string;
  required?: boolean;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
}

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

export default function SelectField({
  label,
  id,
  required = false,
  options,
  value,
  onChange,
}: SelectFieldProps) {
  return (
    <div className={styles['select-field']}>
      <div className={styles['select-label-row']}>
        <label className={styles['select-label']} htmlFor={id}>
          {label}
        </label>
        {required && (
          <span className={styles['required-mark']} aria-hidden>
            *
          </span>
        )}
      </div>
      <div className={styles['select-wrapper']}>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={styles['select-control']}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className={styles['select-chevron']}>
          <ChevronDownIcon />
        </span>
      </div>
    </div>
  );
}
