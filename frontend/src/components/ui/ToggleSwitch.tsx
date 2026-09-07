// src/components/ui/ToggleSwitch.tsx
import styles from './ToggleSwitch.module.css';

interface ToggleSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /**
   * stacked: 라벨 위
   * row: 라벨 왼쪽, 스위치는 가로폭 끝까지 밀어서 오른쪽 (설정 목록용)
   * inline: 라벨 바로 옆에 스위치 (헤더에 하나만 놓을 때)
   */
  layout?: 'stacked' | 'row' | 'inline';
}

export default function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  layout = 'stacked',
}: ToggleSwitchProps) {
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={styles['toggle-switch']}
      data-checked={checked}
    >
      <span className={styles['toggle-knob']} />
    </button>
  );

  if (layout === 'row' || layout === 'inline') {
    return (
      <div className={styles['toggle-group']} data-layout={layout}>
        <div className={styles['toggle-text']}>
          <span className={styles['toggle-label']}>{label}</span>
          {description && (
            <p className={styles['toggle-description']}>{description}</p>
          )}
        </div>
        {toggle}
      </div>
    );
  }

  return (
    <div className={styles['toggle-group']}>
      <span className={styles['toggle-label']}>{label}</span>
      <div className={styles['toggle-row']}>
        {toggle}
        {description && (
          <p className={styles['toggle-description']}>{description}</p>
        )}
      </div>
    </div>
  );
}