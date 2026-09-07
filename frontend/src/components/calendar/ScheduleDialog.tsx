// src/components/calendar/ScheduleDialog.tsx
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { getApiErrorMessage } from '@/api/client';
import {
  createSchedule,
  deleteSchedule,
  updateSchedule,
} from '@/api/scheduleApi';
import {
  DEFAULT_SCHEDULE_COLOR,
  SCHEDULE_COLORS,
  type Schedule,
} from '@/types/schedule';
import styles from './ScheduleDialog.module.css';

/** 서버 검증값과 같게 둔다. 넘겨 보내고 400 을 받느니 입력 단계에서 막는 편이 낫다. */
const MAX_TITLE = 100;
const MAX_MEMO = 500;

interface ScheduleDialogProps {
  /** 수정할 일정. null 이면 새로 만드는 것이다. */
  schedule: Schedule | null;
  /** 새로 만들 때 미리 채워 둘 날짜(YYYY-MM-DD). 날짜 칸을 눌러 열었을 때 쓴다. */
  defaultDate: string;
  onClose: () => void;
  /** 저장·삭제가 끝난 뒤. 목록을 다시 불러오는 쪽에서 쓴다. */
  onSaved: () => void;
}

/**
 * 일정 추가·수정 창.
 *
 * <p>추가와 수정을 한 창으로 합쳤다. 입력 항목이 같아서 나누면 같은 폼을 두 벌 관리하게 되고,
 * 검증 규칙이 어느 한쪽에서만 어긋나는 일이 생긴다.
 */
export default function ScheduleDialog({
  schedule,
  defaultDate,
  onClose,
  onSaved,
}: ScheduleDialogProps) {
  const editing = schedule !== null;

  const [title, setTitle] = useState(schedule?.title ?? '');
  const [targetDate, setTargetDate] = useState(
    schedule?.targetDate ?? defaultDate,
  );
  const [color, setColor] = useState(schedule?.color ?? DEFAULT_SCHEDULE_COLOR);
  // 새 일정은 켠 상태로 시작한다. 날짜를 정해 등록하는 사람은 대개 남은 날짜를 보고 싶어 하는데,
  // 꺼진 채로 저장하면 홈 카드에도 D-day 목록에도 안 나오고 그 이유가 화면에 드러나지 않는다.
  const [dDayEnabled, setDDayEnabled] = useState(schedule?.dDayEnabled ?? true);
  const [memo, setMemo] = useState(schedule?.memo ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  // 열자마자 제목부터 칠 수 있어야 한다. 날짜는 이미 채워져 있다.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Esc 로 닫힌다. 마우스를 쓰지 않는 사용자가 창에 갇히지 않게 한다.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

    const trimmed = title.trim();
    if (!trimmed) {
      setError('일정 제목을 입력해주세요.');
      return;
    }
    if (!targetDate) {
      setError('일정 날짜를 선택해주세요.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = {
        title: trimmed,
        targetDate,
        color,
        dDayEnabled,
        // 빈 메모는 보내지 않는다. 서버에 빈 문자열을 남기면 목록에서 빈 줄로 보인다.
        memo: memo.trim() || undefined,
      };
      if (editing) {
        await updateSchedule(schedule.scheduleId, body);
      } else {
        await createSchedule(body);
      }
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, '일정을 저장하지 못했습니다.'));
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing || saving) return;
    // 되돌릴 수 없는 동작이라 한 번 묻는다.
    if (!window.confirm(`'${schedule.title}' 일정을 삭제할까요?`)) return;

    setSaving(true);
    setError(null);
    try {
      await deleteSchedule(schedule.scheduleId);
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, '일정을 삭제하지 못했습니다.'));
      setSaving(false);
    }
  }

  return (
    <div
      className={styles['overlay']}
      // 바깥을 눌러도 닫힌다. 안쪽 클릭이 올라와 닫히지 않게 대상 검사를 한다.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles['dialog']}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? '일정 수정' : '일정 추가'}
      >
        <h2 className={styles['title']}>{editing ? '일정 수정' : '일정 추가'}</h2>

        <form className={styles['form']} onSubmit={handleSubmit}>
          <label className={styles['field']}>
            <span className={styles['label']}>제목</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              maxLength={MAX_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 정보처리기사 필기"
              className={styles['input']}
            />
          </label>

          <label className={styles['field']}>
            <span className={styles['label']}>날짜</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className={styles['input']}
            />
          </label>

          <div className={styles['field']}>
            <span className={styles['label']}>색상</span>
            <div className={styles['colors']}>
              {SCHEDULE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={styles['color-chip']}
                  style={{ background: c }}
                  data-selected={c === color}
                  aria-label={`색상 ${c}`}
                  aria-pressed={c === color}
                />
              ))}
            </div>
          </div>

          <label className={styles['checkbox-row']}>
            <input
              type="checkbox"
              checked={dDayEnabled}
              onChange={(e) => setDDayEnabled(e.target.checked)}
            />
            {/* 어디에 나오는지 적어 둔다. "D-day 표시하기"만으로는 끄면 무엇이 사라지는지 알 수 없다 */}
            <span>D-day 표시하기 — 홈 화면과 오른쪽 목록에 남은 날짜가 나와요</span>
          </label>

          <label className={styles['field']}>
            <span className={styles['label']}>메모 (선택)</span>
            <textarea
              value={memo}
              maxLength={MAX_MEMO}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              placeholder="시간·장소 등"
              className={styles['textarea']}
            />
          </label>

          {error && (
            <p className={styles['error']} role="alert">
              {error}
            </p>
          )}

          <div className={styles['actions']}>
            {editing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className={styles['delete-btn']}
              >
                삭제
              </button>
            )}
            <div className={styles['actions-right']}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className={styles['cancel-btn']}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                className={styles['save-btn']}
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
