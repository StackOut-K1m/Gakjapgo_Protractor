// src/components/ui/DatePicker.tsx
import { useState, useRef, useEffect } from 'react';
import styles from './DatePicker.module.css';

interface DatePickerProps {
  label: string;
  id: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  timeValue: string;
  onTimeChange: (value: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parseDate(str: string): Date | null {
  const m = str.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${mo}.${day}`;
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={direction === 'left' ? 'M10 3L5 8L10 13' : 'M6 3L11 8L6 13'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2"
        y="3"
        width="12"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 4.5V8l2.5 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function dayKind(column: number): 'sunday' | 'saturday' | 'weekday' {
  if (column === 0) return 'sunday';
  if (column === 6) return 'saturday';
  return 'weekday';
}

export default function DatePicker({
  label,
  id,
  required = false,
  value,
  onChange,
  timeValue,
  onTimeChange,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const parsed = parseDate(value);
  const [viewYear, setViewYear] = useState(
    parsed?.getFullYear() ?? today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    parsed?.getMonth() ?? today.getMonth(),
  );
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function openCalendar() {
    const d = parseDate(value) ?? today;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setOpen(true);
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function selectDay(day: number) {
    onChange(formatDate(new Date(viewYear, viewMonth, day)));
    setOpen(false);
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedDate = parseDate(value);

  return (
    <div className={styles['date-picker-group']} ref={popupRef}>
      <div className={styles['date-picker-label-row']}>
        <label className={styles['date-picker-label']} htmlFor={id}>
          {label}
        </label>
        {required && (
          <span className={styles['required-mark']} aria-hidden>
            *
          </span>
        )}
        <button
          type="button"
          aria-label="캘린더 열기"
          onClick={openCalendar}
          className={styles['calendar-open-btn']}
        >
          <CalendarIcon />
        </button>
      </div>

      <input
        id={id}
        type="text"
        value={value}
        placeholder="YYYY.MM.DD"
        readOnly
        onClick={openCalendar}
        className={styles['date-text-input']}
      />

      <div className={styles['time-input-row']}>
        <span className={styles['time-icon']}>
          <ClockIcon />
        </span>
        <input
          type="text"
          value={timeValue}
          placeholder="HH:MM"
          maxLength={5}
          aria-label={`${label} 시간`}
          onChange={(e) => {
            let v = e.target.value.replace(/[^0-9:]/g, '');
            if (v.length === 2 && !v.includes(':') && timeValue.length < 3) {
              v = `${v}:`;
            }
            onTimeChange(v);
          }}
          className={styles['time-text-input']}
        />
      </div>

      {open && (
        <div className={styles['calendar-popup']}>
          <div className={styles['calendar-header']}>
            <button
              type="button"
              onClick={prevMonth}
              aria-label="이전 달"
              className={styles['calendar-nav-btn']}
            >
              <ChevronIcon direction="left" />
            </button>
            <span className={styles['calendar-month-title']}>
              {viewYear}년 {String(viewMonth + 1).padStart(2, '0')}월
            </span>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="다음 달"
              className={styles['calendar-nav-btn']}
            >
              <ChevronIcon direction="right" />
            </button>
          </div>

          <div className={styles['calendar-weekdays']}>
            {WEEKDAYS.map((w, i) => (
              <span
                key={w}
                className={styles['calendar-weekday']}
                data-kind={dayKind(i)}
              >
                {w}
              </span>
            ))}
          </div>

          <div className={styles['calendar-grid']}>
            {cells.map((day, idx) => {
              if (day === null) {
                return <span key={idx} className={styles['calendar-empty']} />;
              }
              const isSelected =
                selectedDate !== null &&
                selectedDate.getFullYear() === viewYear &&
                selectedDate.getMonth() === viewMonth &&
                selectedDate.getDate() === day;
              const isToday =
                today.getFullYear() === viewYear &&
                today.getMonth() === viewMonth &&
                today.getDate() === day;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={styles['calendar-day']}
                  data-kind={dayKind(idx % 7)}
                  data-selected={isSelected}
                  data-today={isToday}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
