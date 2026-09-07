import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

import { getApiErrorMessage } from '@/api/client';
import { getMyOnboarding, updateMyOnboarding } from '@/api/onboardingApi';
import styles from './DailyGoalCard.module.css';

interface DailyGoalCardProps {
  studiedMinutes: number;
  goalMinutes: number;
  /** true 일 때만 '목표 시간 설정' 버튼을 보여준다(온보딩 API가 인증 필요). */
  canEditGoal?: boolean;
  /** 저장이 끝난 뒤 부모가 화면 값을 갱신하도록 알린다. */
  onGoalSaved?: (minutes: number) => void;
}

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 30분 단위로 받는다. 서버는 분으로 저장하므로 정수 분이 나와야 한다. */
const HOUR_STEP = 0.5;
const HOUR_PRESETS = [1, 2, 3, 4, 6];

function formatHourMinute(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export default function DailyGoalCard({
  studiedMinutes,
  goalMinutes,
  canEditGoal = false,
  onGoalSaved,
}: DailyGoalCardProps) {
  const ratio = goalMinutes > 0 ? Math.min(studiedMinutes / goalMinutes, 1) : 0;
  const percent = Math.round(ratio * 100);

  /**
   * 실제로 그릴 비율. 0 에서 시작해 다음 프레임에 목표치로 바꿔,
   * 12시 방향부터 시계 방향으로 차오르는 모션을 만든다.
   * (도넛은 CSS 에서 -90deg 회전돼 있어 시작점이 12시다)
   */
  const [drawnRatio, setDrawnRatio] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawnRatio(ratio));
    return () => cancelAnimationFrame(id);
  }, [ratio]);

  const [open, setOpen] = useState(false);

  return (
    <section className={styles['goal-card']}>
      <div className={styles['goal-head']}>
        <h3 className={styles['goal-title']}>오늘의 목표</h3>
        {canEditGoal && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={styles['goal-setting-btn']}
          >
            목표 시간 설정
          </button>
        )}
      </div>

      <div className={styles['goal-body']}>
        <svg
          className={styles['goal-donut']}
          viewBox="0 0 140 140"
          role="img"
          aria-label={`오늘의 목표 ${percent}퍼센트 달성`}
        >
          <circle cx="70" cy="70" r={RADIUS} className={styles['donut-track']} />
          <circle
            cx="70"
            cy="70"
            r={RADIUS}
            className={styles['donut-fill']}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - drawnRatio)}
          />
        </svg>

        <div className={styles['goal-center']}>
          <p className={styles['goal-studied']}>
            {formatHourMinute(studiedMinutes)}
          </p>
          <p className={styles['goal-target']}>
            / {formatHourMinute(goalMinutes)}
          </p>
          <span className={styles['goal-percent']}>{percent}% 완료</span>
        </div>
      </div>

      {open && (
        <GoalSettingDialog
          currentMinutes={goalMinutes}
          onSaved={(m) => onGoalSaved?.(m)}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

interface GoalSettingDialogProps {
  currentMinutes: number;
  onSaved: (minutes: number) => void;
  onClose: () => void;
}

/**
 * 목표 시간 설정 창.
 *
 * 온보딩을 마친 회원만 목표를 고칠 수 있다(PATCH). 온보딩 전이면 설정 행이 없어
 * POST 로 만들어야 하는데, 이제 POST 는 감지 동의 true 를 강제하고 동의는 개인정보
 * 항목이라 화면이 임의로 채울 수 없다. 그래서 여기서 대신 만들지 않고
 * 온보딩 화면으로 보낸다.
 */
function GoalSettingDialog({
  currentMinutes,
  onSaved,
  onClose,
}: GoalSettingDialogProps) {
  type Mode = 'loading' | 'edit' | 'setup';
  const [mode, setMode] = useState<Mode>('loading');
  const navigate = useNavigate();

  const [hours, setHours] = useState(
    currentMinutes > 0 ? String(currentMinutes / 60) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 저장 방식(수정/신규)이 달라지므로 열릴 때 온보딩 여부만 확인한다.
  useEffect(() => {
    let alive = true;
    getMyOnboarding()
      .then(() => {
        if (alive) setMode('edit');
      })
      .catch((e) => {
        if (!alive) return;
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          setMode('setup');
          return;
        }
        setError(getApiErrorMessage(e, '설정 정보를 불러오지 못했습니다.'));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'loading') inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parsed = Number(hours);
  const hoursValid =
    hours.trim() !== '' &&
    Number.isFinite(parsed) &&
    parsed > 0 &&
    Number.isInteger(parsed / HOUR_STEP);
  const canSave = hoursValid && mode !== 'loading';

  async function handleSave() {
    if (!canSave || saving || mode !== 'edit') return;
    const minutes = Math.round(parsed * 60);
    setSaving(true);
    setError('');
    try {
      await updateMyOnboarding({ goalMinutes: minutes });
      onSaved(minutes);
      onClose();
    } catch (e) {
      setError(getApiErrorMessage(e, '목표 시간을 저장하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles['dialog-overlay']} onClick={onClose}>
      <div
        className={styles['dialog']}
        role="dialog"
        aria-modal="true"
        aria-label="목표 시간 설정"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className={styles['dialog-title']}>목표 시간 설정</h4>

        {mode === 'loading' ? (
          <p className={styles['dialog-desc']}>불러오는 중...</p>
        ) : mode === 'setup' ? (
          <p className={styles['dialog-desc']}>
            목표 시간은 첫 설정(온보딩)을 마친 뒤에 정할 수 있어요. 공부 목적과
            AI 감지 동의를 먼저 선택해 주세요.
          </p>
        ) : (
          <>
            <p className={styles['dialog-desc']}>
              하루에 얼마나 공부할지 정해보세요. 30분 단위로 설정할 수 있어요.
            </p>

            <div className={styles['dialog-chips']}>
              {HOUR_PRESETS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(String(h))}
                  aria-pressed={hours === String(h)}
                  className={styles['dialog-chip']}
                  data-selected={hours === String(h)}
                >
                  {h}시간
                </button>
              ))}
            </div>

            <div className={styles['dialog-input-row']}>
              <input
                ref={inputRef}
                type="number"
                min={HOUR_STEP}
                step={HOUR_STEP}
                inputMode="decimal"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="직접 입력"
                className={styles['dialog-input']}
                data-invalid={hours.trim() !== '' && !hoursValid}
              />
              <span className={styles['dialog-unit']}>시간</span>
            </div>

            {hours.trim() !== '' && !hoursValid && (
              <p className={styles['dialog-error']}>
                0.5시간(30분) 단위로 입력해 주세요. 예: 1.5
              </p>
            )}
            {hoursValid && (
              <p className={styles['dialog-hint']}>
                하루 {formatHourMinute(Math.round(parsed * 60))} 목표
              </p>
            )}

          </>
        )}

        {error && (
          <p className={styles['dialog-error']} role="alert">
            {error}
          </p>
        )}

        <div className={styles['dialog-actions']}>
          <button
            type="button"
            onClick={onClose}
            className={styles['dialog-cancel']}
          >
            취소
          </button>
          {mode === 'setup' ? (
            <button
              type="button"
              onClick={() => navigate('/onboarding')}
              className={styles['dialog-save']}
            >
              온보딩 하러 가기
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className={styles['dialog-save']}
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
