// src/components/study/StretchingOverlay.tsx
import type { Stretching, StretchingState } from '@/types/stretching';
import type { CanvasRefCallback, VideoRefCallback } from '@/types/video';
import SelfVideo from './SelfVideo';
import { WarningIcon } from './icons';
import styles from './StretchingOverlay.module.css';

interface StretchingOverlayProps {
  attachVideo: VideoRefCallback;
  /** 배경 효과 캔버스. null 이면 효과가 꺼져 있다 */
  attachEffectCanvas?: CanvasRefCallback | null;
  state: StretchingState;
  /** 경고 누적 원인 (예: '거북목') */
  triggerLabel: string;
  triggerCount: number;
  onRetry: () => void;
  onPass: () => void;
  onReturn: () => void;
  /** 실시간 판정 안내 (예: "그대로 유지 — 3초"). 없으면 가이드 문구를 그대로 쓴다 */
  liveHint?: string;
  /**
   * 아직 동작을 안 골랐을 때 보여줄 후보들. 비어 있지 않고 onSelect 가 있으면
   * 진행 화면 대신 선택 화면을 띄운다.
   */
  choices?: Stretching[];
  onSelect?: (stretching: Stretching) => void;
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function StretchingOverlay({
  attachVideo,
  attachEffectCanvas,
  state,
  triggerLabel,
  triggerCount,
  onRetry,
  onPass,
  onReturn,
  liveHint,
  choices,
  onSelect,
}: StretchingOverlayProps) {
  const { phase, steps, stepStates, currentStepIndex, progressPercent } = state;
  const attemptsLeft = state.maxAttempts - state.attemptsUsed;
  const isPenalty = phase === 'penalty';
  /** 고르기 전 단계인지. 후보가 없으면(가이드 조회 실패) 선택을 건너뛰고 기본 루틴으로 간다 */
  const choosing = onSelect !== undefined && (choices?.length ?? 0) > 0;

  const banner =
    phase === 'failed'
      ? '스트레칭 인식 제한 시간이 만료되었습니다. 다시 시도하거나 패스를 선택하여 종료해주세요.'
      : isPenalty
        ? '스트레칭 불이행에 따른 패널티 상태입니다. 다음 세션의 정상 기록이 필요합니다.'
        : `${triggerLabel} 자세가 ${triggerCount}회 초과 감지되었습니다. 스트레칭을 마친 후 학습방 복귀가 가능합니다. (스킵 불가)`;

  return (
    <div
      className={styles['stretching-overlay']}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles['overlay-inner']}>
        <p
          className={styles['overlay-banner']}
          data-tone={isPenalty ? 'danger' : 'warning'}
        >
          <WarningIcon />
          {banner}
        </p>

        {choosing ? (
          <section className={styles['panel']} data-phase="choosing">
            <h2 className={styles['panel-title']}>어떤 동작으로 풀어볼까요?</h2>
            <p className={styles['choose-hint']}>
              하나를 고르면 웹캠으로 동작을 확인해 드려요.
            </p>

            <ul className={styles['choice-list']}>
              {choices?.map((item) => (
                <li key={item.stretchingId}>
                  <button
                    type="button"
                    className={styles['choice-item']}
                    onClick={() => onSelect?.(item)}
                  >
                    <span className={styles['choice-name']}>{item.name}</span>
                    <span className={styles['choice-guide']}>
                      {item.guideText}
                    </span>
                    <span className={styles['choice-hold']}>
                      {item.holdSeconds}초 유지
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : isPenalty ? (
          <section className={styles['panel']} data-phase="penalty">
            <span className={styles['penalty-icon']}>
              <WarningIcon size={32} />
            </span>
            <h2 className={styles['panel-title']}>
              스트레칭을 건너뛰었습니다
            </h2>

            {/*
              점수를 깎지 않는다. 예전에는 "최종 학업 성취도 포인트가 50% 감점 처리됩니다"라고
              적혀 있었는데 감점 코드가 어디에도 없었다 — 화면만 그렇게 말하고 실제로는 아무 일도
              일어나지 않는 상태였다. 없는 벌을 알리는 대신, 기록에 어떻게 남는지를 알려준다.
            */}
            <div className={styles['penalty-box']}>
              <p className={styles['penalty-box-title']}>기록 안내</p>
              <p className={styles['penalty-box-text']}>
                지속적인 {triggerLabel} 감지 경고에도 스트레칭을 건너뛰었습니다.
                이번 건은{' '}
                <strong className={styles['penalty-emphasis']}>
                  수행하지 않음
                </strong>{' '}
                으로 기록되어 주간 리포트의 스트레칭 이행률에 반영됩니다. 점수가
                깎이지는 않습니다.
              </p>
            </div>

            <p className={styles['penalty-countdown']}>
              <span className={styles['countdown-dot']} aria-hidden />
              {state.penaltyCountdown}초 후 스터디룸으로 자동 이동합니다
            </p>

            <div className={styles['panel-actions']}>
              <button
                type="button"
                onClick={onReturn}
                className={styles['primary-btn']}
              >
                스터디룸으로 돌아가기 →
              </button>
            </div>
          </section>
        ) : (
          <section className={styles['panel']} data-phase={phase}>
            <span className={styles['panel-badge']} data-phase={phase}>
              {phase === 'complete'
                ? '🧘 실시간 AI 모션 스트레칭 완료'
                : phase === 'failed'
                  ? '✕ 실시간 AI 모션 스트레칭 실패'
                  : '🧘 실시간 AI 모션 스트레칭'}
            </span>

            <h2 className={styles['panel-title']}>
              {phase === 'complete'
                ? '목과 어깨 스트레칭을 완료했습니다!'
                : phase === 'failed'
                  ? '스트레칭 인식에 실패했습니다'
                  : '목과 어깨를 풀어주세요'}
            </h2>

            <p className={styles['panel-desc']}>
              {phase === 'complete'
                ? '피로를 풀었으니 이제 다시 맑은 정신으로 학습을 시작해볼까요?'
                : phase === 'failed'
                  ? '제한 시간 내에 올바른 스트레칭 동작이 감지되지 않았습니다. 바른 자세로 다시 한번 도전해보세요.'
                  : '화면의 가이드 모션을 일치시키면 다음 단계로 넘어갑니다.'}
            </p>

            <div className={styles['stage']} data-phase={phase}>
              <SelfVideo
                attachVideo={attachVideo}
                attachEffectCanvas={attachEffectCanvas}
                className={styles['stage-video']}
              />

              <span className={styles['stage-tag']}>
                <span className={styles['stage-dot']} aria-hidden />
                {phase === 'complete'
                  ? 'AI SESSION COMPLETED'
                  : phase === 'failed'
                    ? 'AI DETECT FAILURE'
                    : 'AI REALTIME TRACKING'}
              </span>
              <span className={styles['stage-quality']}>1080p HD</span>

              {phase === 'motion' && (
                <span className={styles['guide-circle']} aria-hidden />
              )}

              {phase === 'complete' && (
                <span className={styles['result-mark']} data-tone="ok">
                  <CheckMark />
                </span>
              )}

              {phase === 'failed' && (
                <span className={styles['result-mark']} data-tone="danger">
                  <CrossMark />
                </span>
              )}

              <p className={styles['stage-caption']}>
                {phase === 'complete'
                  ? '🎉 모든 스트레칭 동작을 완벽하게 수행하셨습니다!'
                  : phase === 'failed'
                    ? state.failureHint
                    : (liveHint ?? steps[currentStepIndex].guide)}
              </p>
            </div>

            <ul className={styles['step-list']}>
              {steps.map((step, i) => (
                <li
                  key={step.id}
                  className={styles['step-item']}
                  data-state={stepStates[i]}
                >
                  <span className={styles['step-dot']} aria-hidden />
                  {i + 1}. {step.label} (
                  {stepStates[i] === 'done'
                    ? '완료'
                    : stepStates[i] === 'failed'
                      ? '인식 실패'
                      : stepStates[i] === 'active'
                        ? '진행 중'
                        : '미진행'}
                  )
                </li>
              ))}
            </ul>

            <div className={styles['progress-row']}>
              <span className={styles['progress-label']}>
                {phase === 'complete' ? '동작 완료' : '동작 완성도'}{' '}
                {progressPercent}%
              </span>
              <span className={styles['progress-track']}>
                <span
                  className={styles['progress-fill']}
                  data-phase={phase}
                  style={{ width: `${progressPercent}%` }}
                />
              </span>
            </div>

            {phase === 'motion' && (
              <p className={styles['panel-hint']}>
                동작을 성공적으로 따라하시면 자동으로 학습에 복귀됩니다.
              </p>
            )}

            {phase === 'complete' && (
              <div className={styles['panel-actions']}>
                <button
                  type="button"
                  onClick={onReturn}
                  className={styles['primary-btn']}
                >
                  스트레칭 완료 - 스터디로 돌아가기 →
                </button>
              </div>
            )}

            {phase === 'failed' && (
              <>
                <p className={styles['attempts-left']}>
                  남은 기회 {attemptsLeft}회 / {state.maxAttempts}회
                </p>
                <div className={styles['panel-actions']} data-columns="2">
                  <button
                    type="button"
                    onClick={onRetry}
                    disabled={attemptsLeft <= 0}
                    className={styles['primary-btn']}
                  >
                    다시 도전하기 ↻
                  </button>
                  <button
                    type="button"
                    onClick={onPass}
                    className={styles['ghost-btn']}
                  >
                    스트레칭 건너뛰기
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
