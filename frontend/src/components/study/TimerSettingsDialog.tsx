// src/components/study/TimerSettingsDialog.tsx
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { getRoomTimer, updateRoomTimer } from '@/api/studyRoomApi';
import styles from './TimerSettingsDialog.module.css';

interface TimerSettingsDialogProps {
  roomId: number;
  onClose: () => void;
  /** 저장에 성공했을 때. 바뀐 설정을 화면에 반영하는 쪽에서 쓴다. */
  onSaved?: (focusMinutes: number, breakMinutes: number) => void;
}

/** 서버 검증값(@Min). 집중은 최소 1분, 휴식은 0분(휴식 없음)까지 허용된다. */
const MIN_FOCUS_MINUTES = 1;
const MIN_BREAK_MINUTES = 0;

/**
 * 학습/쉬는 시간 변경 — 방장만 연다.
 *
 * 값은 방에 저장되므로 방 전원에게 같이 적용된다. 저장만 하고 타이머를 시작하지는 않는다
 * (시작은 컨트롤바 설정 메뉴의 다른 항목이다).
 */
export default function TimerSettingsDialog({
  roomId,
  onClose,
  onSaved,
}: TimerSettingsDialogProps) {
  const [focusMinutes, setFocusMinutes] = useState('');
  const [breakMinutes, setBreakMinutes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // 현재 설정을 먼저 보여줘야 무엇을 바꾸는지 알 수 있다.
  useEffect(() => {
    let alive = true;
    getRoomTimer(roomId)
      .then((timer) => {
        if (!alive) return;
        setFocusMinutes(String(timer.focusMinutes));
        setBreakMinutes(String(timer.breakMinutes));
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError('현재 설정을 불러오지 못했습니다.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [roomId]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const focus = Number(focusMinutes);
    const rest = Number(breakMinutes);

    // 서버도 검증하지만, 저장 버튼을 누른 뒤 400 을 보는 것보다 여기서 막는 편이 낫다.
    if (!Number.isInteger(focus) || focus < MIN_FOCUS_MINUTES) {
      setError(`학습 시간은 ${MIN_FOCUS_MINUTES}분 이상이어야 합니다.`);
      return;
    }
    if (!Number.isInteger(rest) || rest < MIN_BREAK_MINUTES) {
      setError(`쉬는 시간은 ${MIN_BREAK_MINUTES}분 이상이어야 합니다.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateRoomTimer(roomId, {
        focusMinutes: focus,
        breakMinutes: rest,
      });
      onSaved?.(focus, rest);
      onClose();
    } catch {
      // 방장이 아니면 403 이 온다. 메뉴 자체를 방장에게만 보여주지만 그 사이 방장이 바뀔 수 있다.
      setError('저장하지 못했습니다. 방장만 변경할 수 있습니다.');
      setSaving(false);
    }
  }

  return (
    <div className={styles['backdrop']} onClick={onClose} role="presentation">
      <div
        className={styles['dialog']}
        role="dialog"
        aria-modal="true"
        aria-label="학습·쉬는 시간 변경"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          ref={closeRef}
          onClick={onClose}
          className={styles['close-btn']}
          aria-label="닫기"
        >
          ✕
        </button>

        <h2 className={styles['title']}>학습 / 쉬는 시간 변경</h2>
        <p className={styles['desc']}>
          이 방에 있는 모든 사람에게 함께 적용됩니다.
        </p>

        {loading ? (
          <p className={styles['state']}>불러오는 중…</p>
        ) : (
          <form onSubmit={handleSubmit} className={styles['form']}>
            <label className={styles['field']}>
              <span className={styles['label']}>학습 시간(분)</span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_FOCUS_MINUTES}
                value={focusMinutes}
                onChange={(e) => setFocusMinutes(e.target.value)}
                className={styles['input']}
              />
            </label>

            <label className={styles['field']}>
              <span className={styles['label']}>쉬는 시간(분)</span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN_BREAK_MINUTES}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
                className={styles['input']}
              />
            </label>

            {error && (
              <p className={styles['error']} role="alert">
                {error}
              </p>
            )}

            <div className={styles['actions']}>
              <button
                type="button"
                onClick={onClose}
                className={styles['action-btn']}
                data-variant="quiet"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                className={styles['action-btn']}
                data-variant="primary"
              >
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
