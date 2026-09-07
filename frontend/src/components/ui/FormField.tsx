// src/components/ui/FormField.tsx
import styles from './FormField.module.css';

interface FormFieldProps {
  label: string;
  id: string;
  required?: boolean;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'date' | 'time';
}

export default function FormField({
  label,
  id,
  required = false,
  placeholder,
  value,
  onChange,
  type = 'text',
}: FormFieldProps) {
  return (
    <div className={styles['form-field']}>
      <div className={styles['field-label-row']}>
        <label className={styles['field-label']} htmlFor={id}>
          {label}
        </label>
        {required && (
          <span className={styles['required-mark']} aria-hidden>
            *
          </span>
        )}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={styles['field-input']}
      />
    </div>
  );
}
