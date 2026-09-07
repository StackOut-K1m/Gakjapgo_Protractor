// src/pages/OnboardingPage.tsx
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getApiErrorMessage } from '@/api/client';
import axios from 'axios';

import {
  getMyOnboarding,
  getOnboardingOptions,
  saveOnboarding,
  updateMyOnboarding,
} from '@/api/onboardingApi';
import { useAuthStore } from '@/stores/useAuthStore';
import type { OnboardingOptions } from '@/types/onboarding';
import styles from './OnboardingPage.module.css';

const TOTAL_STEPS = 4;

/** 하루 목표 학습 시간 빠른 선택(시간). 직접 입력도 가능하다. */
const GOAL_HOUR_PRESETS = [1, 2, 3, 4, 6];

/** 30분 단위까지 받는다. 백엔드는 분(goalMinutes)으로 저장하므로 정수 분이 나와야 한다. */
const HOUR_STEP = 0.5;

function formatHours(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const nickname = useAuthStore((s) => s.member?.nickname ?? '');

  /**
   * 마치거나 건너뛴 뒤 갈 곳.
   *
   * 회원가입 직후에는 홈이 맞다. 다만 마이페이지에서 '온보딩 다시 하기'로 들어온 경우
   * 홈으로 보내면 보던 자리를 잃는다 — 부르는 쪽이 state.from 으로 알려 준다.
   */
  const returnTo = (location.state as { from?: string } | null)?.from ?? '/';

  const [options, setOptions] = useState<OnboardingOptions | null>(null);
  const [loadError, setLoadError] = useState('');

  /** 지금까지 공개된 단계. 다음을 눌러야 하나씩 늘어난다. */
  const [openedStep, setOpenedStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 답변
  const [purposes, setPurposes] = useState<string[]>([]);
  const [goalText, setGoalText] = useState('');
  /** 사용자 입력은 "시간" 단위다. 전송 직전에 분으로 바꾼다. */
  const [goalHours, setGoalHours] = useState('');
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [postureConsent, setPostureConsent] = useState(true);
  const [drowsinessConsent, setDrowsinessConsent] = useState(true);
  /**
   * 학습 장면 저장(타임랩스) 동의.
   *
   * 앞의 둘과 달리 기본값을 끈 상태로 둔다. 감지는 좌표만 읽고 버리지만 이건 얼굴이 담긴
   * 사진을 남기는 일이라, 무게가 다른 것을 같이 켜두고 시작하면 안 된다.
   */
  const [captureConsent, setCaptureConsent] = useState(false);
  const [agreed, setAgreed] = useState(false);

  /** 각 단계 섹션 DOM. 다음을 누르면 새로 열린 단계로 스크롤한다. */
  const stepRefs = useRef<(HTMLElement | null)[]>([]);
  /** 스크롤은 "다음을 눌러 단계가 열렸을 때"만 한다. 첫 렌더에서는 움직이지 않는다. */
  const shouldScrollRef = useRef(false);

  useEffect(() => {
    getOnboardingOptions()
      .then(setOptions)
      .catch((e) =>
        setLoadError(
          getApiErrorMessage(e, '온보딩 정보를 불러오지 못했습니다.'),
        ),
      );
  }, []);

  /**
   * 이미 저장해 둔 답변을 불러와 채운다.
   *
   * 이 화면은 마이페이지에서 다시 열 수 있다. 빈 값으로 시작하면 목표 시간 하나 바꾸려고
   * 관심 태그를 전부 다시 골라야 하고, 그대로 저장하면 예전 값이 조용히 지워진다.
   *
   * 처음 온보딩(설정 행 없음)은 404 다 — 그때는 채울 것이 없으니 그냥 넘어간다.
   * 그 밖의 오류도 삼킨다. 불러오기에 실패했다고 온보딩 자체를 막을 이유는 없다.
   */
  useEffect(() => {
    let alive = true;
    getMyOnboarding()
      .then((me) => {
        if (!alive) return;
        setPurposes(me.purposes);
        setGoalText(me.goalText ?? '');
        // 저장은 분, 화면은 시간이다. 30분 단위까지 받으므로 소수점이 남을 수 있다.
        setGoalHours(
          me.goalMinutes === null ? '' : String(me.goalMinutes / 60),
        );
        setTagIds(me.tags.map((t) => t.studyTagId));
        setPostureConsent(me.postureDetectionConsent);
        setDrowsinessConsent(me.drowsinessDetectionConsent);
        setCaptureConsent(me.postureCaptureConsent);
        // 이미 온보딩을 마친 사람은 이용 동의를 한 번 받은 상태다. 고치러 들어온
        // 사람에게 같은 체크를 다시 요구하면 목표 시간 하나 바꾸는 데 걸림돌이 된다.
        setAgreed(me.onboardingCompletedAt !== null);
      })
      .catch(() => {
        /* 처음 온보딩이거나 조회 실패 — 빈 값으로 시작한다 */
      });
    return () => {
      alive = false;
    };
  }, []);

  // 단계가 열린 뒤 실제 DOM 이 그려진 다음에 스크롤해야 위치가 맞는다.
  useEffect(() => {
    if (!shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    const el = stepRefs.current[openedStep - 1];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 키보드 사용자를 위해 초점도 옮긴다.
    el.focus({ preventScroll: true });
  }, [openedStep]);

  function goNext(from: number) {
    setError('');
    if (from >= TOTAL_STEPS) return;
    shouldScrollRef.current = true;
    setOpenedStep((prev) => Math.max(prev, from + 1));
  }

  function goPrev(from: number) {
    if (from <= 1) return;
    shouldScrollRef.current = true;
    setOpenedStep(from - 1);
  }

  function togglePurpose(name: string) {
    setPurposes((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  }

  function toggleTag(id: number) {
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  const parsedHours = Number(goalHours);
  const goalHoursEmpty = goalHours.trim() === '';
  // 0.5시간(30분) 단위만 허용한다. 그래야 분으로 바꿨을 때 정수가 된다.
  const goalHoursValid =
    goalHoursEmpty ||
    (Number.isFinite(parsedHours) &&
      parsedHours > 0 &&
      Number.isInteger(parsedHours / HOUR_STEP));
  const goalMinutes = goalHoursEmpty ? null : Math.round(parsedHours * 60);

  /**
   * 단계별 완료 여부(진행 바용).
   *
   * 2단계는 목표 문구·시간이 둘 다 선택 항목이라, 하나라도 제대로 적었을 때 완료로 본다.
   * 3단계는 고르지 않아도 넘어갈 수 있어서 열리기만 하면 완료다 — 그러지 않으면 채널을
   * 고르지 않은 사람의 진행 바가 끝까지 안 찬다.
   */
  const stepDone = [
    purposes.length > 0,
    goalHoursValid && (goalText.trim() !== '' || !goalHoursEmpty),
    openedStep > 3,
    agreed,
  ];

  /**
   * 졸음·자세 감지 동의. 둘 다 켜져 있어야 시작할 수 있다.
   *
   * 이 서비스가 하는 일 자체가 카메라로 졸음과 자세를 보는 것이라, 하나라도 끄면
   * 남는 기능이 없다. 그런데 아래 '위 내용에 동의합니다' 체크만 조건으로 두고 있어서,
   * 두 토글을 모두 OFF 로 놓고 체크 하나만 눌러도 가입이 끝났다.
   * 동의하지 않은 감지가 켜진 계정이 만들어지는 셈이었다.
   */
  const detectionConsented = postureConsent && drowsinessConsent;

  /** 마지막 단계의 시작하기 버튼을 누를 수 있는 조건 */
  const canSubmit = detectionConsented && agreed;

  async function handleSubmit() {
    if (submitting) return;
    setError('');

    if (purposes.length === 0) {
      setError('공부 목적을 1개 이상 선택해 주세요.');
      setOpenedStep(1);
      shouldScrollRef.current = true;
      return;
    }
    if (!goalHoursValid) {
      setError('목표 시간은 0.5시간(30분) 단위로 입력해 주세요.');
      return;
    }
    // 버튼이 비활성화돼 있어도 여기서 한 번 더 막는다. 화면 상태만 믿으면
    // 조건이 늘어났을 때 이쪽을 고치는 걸 잊는다.
    if (!detectionConsented) {
      setError('졸음 감지와 자세 감지에 모두 동의해야 시작할 수 있습니다.');
      return;
    }
    if (!agreed) {
      setError('AI 코치 이용에 동의해야 시작할 수 있습니다.');
      return;
    }

    setSubmitting(true);
    const payload = {
      purposes,
      // 빈 값은 아예 보내지 않아 "미설정"으로 남긴다.
      goalText: goalText.trim() || undefined,
      // 화면은 시간 단위지만 백엔드는 분으로 받는다.
      goalMinutes: goalMinutes ?? undefined,
      tagIds,
      postureDetectionConsent: postureConsent,
      drowsinessDetectionConsent: drowsinessConsent,
      postureCaptureConsent: captureConsent,
    };

    try {
      await saveOnboarding(payload);
      navigate(returnTo, { replace: true });
    } catch (e) {
      // 홈의 '목표 시간 설정'으로 이미 설정 행이 만들어졌으면 409 가 온다.
      // 그때는 저장이 아니라 수정으로 이어가야 온보딩을 끝낼 수 있다.
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        try {
          /*
           * 수정은 "안 보낸 필드 = 그대로"라, 위 payload 를 그대로 넘기면 목표를 비워도
           * 예전 값이 남는다(빈 값이 undefined 가 되어 필드째 빠진다).
           * 지우려는 의도를 서버가 알아듣는 값으로 바꿔 보낸다 — 빈 문자열과 0 이 각각
           * "문구 지우기"와 "시간 해제"다.
           *
           * 이 값을 처음 저장(POST)에 쓸 수는 없다. 그쪽은 goalMinutes 를 1 이상으로
           * 검증해서 0 을 보내면 400 이 난다.
           */
          await updateMyOnboarding({
            ...payload,
            goalText: goalText.trim(),
            goalMinutes: goalMinutes ?? 0,
          });
          navigate(returnTo, { replace: true });
          return;
        } catch (patchError) {
          setError(
            getApiErrorMessage(patchError, '온보딩 저장에 실패했습니다.'),
          );
          return;
        } finally {
          setSubmitting(false);
        }
      }
      setError(getApiErrorMessage(e, '온보딩 저장에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    // 온보딩은 나중에 마이페이지에서 다시 할 수 있으므로 건너뛰기를 허용한다.
    navigate(returnTo, { replace: true });
  }

  if (loadError) {
    return (
      <div className={styles['onboarding-page']}>
        <p className={styles['load-error']} role="alert">
          {loadError}
        </p>
      </div>
    );
  }

  if (!options) {
    return (
      <div className={styles['onboarding-page']}>
        <p className={styles['loading']}>불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className={styles['onboarding-page']}>
      <div className={styles['onboarding-inner']}>
        <header className={styles['intro']}>
          <h1 className={styles['intro-title']}>
            {nickname ? `${nickname}님, 환영해요 👋` : '환영해요 👋'}
          </h1>
          <p className={styles['intro-sub']}>
            몇 가지만 알려주시면 홈 추천과 AI 코치를 맞춰드릴게요.
          </p>
          <button
            type="button"
            onClick={handleSkip}
            className={styles['skip-btn']}
          >
            나중에 할게요
          </button>
        </header>

        {/*
          4단계 진행 바. 채움 기준은 "그 단계를 열었는가"가 아니라 "채워야 할 것을
          채웠는가"다 — 열기만 하고 비워 둔 단계까지 초록이면 진행률이 거짓말이 된다.
          3단계(관심 채널)는 고르지 않아도 넘어갈 수 있는 단계라 열리면 완료로 본다.
        */}
        <ol className={styles['progress']} aria-label="온보딩 진행 상황">
          {stepDone.map((done, i) => (
            <li
              key={i}
              className={styles['progress-step']}
              data-done={done}
              data-current={i + 1 === openedStep}
            >
              <span className={styles['progress-bar']} />
              <span className={styles['progress-label']}>{i + 1}단계</span>
            </li>
          ))}
        </ol>

        {/* ── 1단계: 공부 목적 ── */}
        <StepSection
          index={1}
          openedStep={openedStep}
          title="어떤 목적으로 공부하세요?"
          description="여러 개 선택할 수 있어요. 선택한 목적으로 홈 추천이 맞춰집니다."
          registerRef={(el) => (stepRefs.current[0] = el)}
        >
          <div className={styles['chip-group']}>
            {options.purposes.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => togglePurpose(name)}
                aria-pressed={purposes.includes(name)}
                className={styles['chip']}
                data-selected={purposes.includes(name)}
              >
                {name}
              </button>
            ))}
          </div>

          <div className={styles['step-actions']}>
            <button
              type="button"
              onClick={() => goNext(1)}
              disabled={purposes.length === 0}
              className={styles['next-btn']}
            >
              다음
            </button>
          </div>
          {purposes.length === 0 && (
            <p className={styles['hint']}>
              1개 이상 선택하면 다음으로 넘어가요.
            </p>
          )}
        </StepSection>

        {/* ── 2단계: 목표(문구 + 시간) ── */}
        <StepSection
          index={2}
          openedStep={openedStep}
          title="목표를 적어볼까요?"
          description="구체적인 목표와 하루 학습량이 동기부여에 도움이 돼요."
          registerRef={(el) => (stepRefs.current[1] = el)}
        >
          <div className={styles['field']}>
            <label htmlFor="goal-text" className={styles['label']}>
              나의 목표 <span className={styles['optional']}>(선택)</span>
            </label>
            <input
              id="goal-text"
              type="text"
              maxLength={255}
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              placeholder="예: 9급 행정직 필기 합격"
              className={styles['input']}
            />
            <p className={styles['field-hint']}>{goalText.length}/255</p>
          </div>

          <div className={styles['field']}>
            <label htmlFor="goal-hours" className={styles['label']}>
              하루 목표 학습 시간{' '}
              <span className={styles['optional']}>(선택)</span>
            </label>
            <div className={styles['chip-group']}>
              {GOAL_HOUR_PRESETS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setGoalHours(String(h))}
                  aria-pressed={goalHours === String(h)}
                  className={styles['chip']}
                  data-selected={goalHours === String(h)}
                >
                  {formatHours(h)}
                </button>
              ))}
            </div>
            <div className={styles['minutes-row']}>
              <input
                id="goal-hours"
                type="number"
                min={HOUR_STEP}
                step={HOUR_STEP}
                inputMode="decimal"
                value={goalHours}
                onChange={(e) => setGoalHours(e.target.value)}
                placeholder="직접 입력"
                className={styles['input']}
                data-invalid={!goalHoursValid}
              />
              <span className={styles['unit']}>시간</span>
            </div>
            {!goalHoursValid ? (
              <p className={styles['field-error']}>
                0.5시간(30분) 단위로 입력해 주세요. 예: 1.5
              </p>
            ) : (
              goalMinutes !== null && (
                <p className={styles['field-hint']}>
                  하루 {formatHours(parsedHours)} 목표
                </p>
              )
            )}
          </div>

          <div className={styles['step-actions']}>
            <button
              type="button"
              onClick={() => goPrev(2)}
              className={styles['prev-btn']}
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => goNext(2)}
              disabled={!goalHoursValid}
              className={styles['next-btn']}
            >
              다음
            </button>
          </div>
        </StepSection>

        {/* ── 3단계: 관심 테마 채널 ── */}
        <StepSection
          index={3}
          openedStep={openedStep}
          title="관심 테마 채널을 골라주세요"
          description="고른 채널이 홈 상단과 추천 스터디룸에 먼저 노출돼요."
          registerRef={(el) => (stepRefs.current[2] = el)}
        >
          <div className={styles['chip-group']}>
            {options.tags.map((tag) => (
              <button
                key={tag.studyTagId}
                type="button"
                onClick={() => toggleTag(tag.studyTagId)}
                aria-pressed={tagIds.includes(tag.studyTagId)}
                className={styles['chip']}
                data-selected={tagIds.includes(tag.studyTagId)}
              >
                {tag.name}
              </button>
            ))}
          </div>

          <div className={styles['step-actions']}>
            <button
              type="button"
              onClick={() => goPrev(3)}
              className={styles['prev-btn']}
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => goNext(3)}
              className={styles['next-btn']}
            >
              다음
            </button>
          </div>
        </StepSection>

        {/* ── 4단계: AI 코치 동의 ── */}
        <StepSection
          index={4}
          openedStep={openedStep}
          title="AI 코치가 도와드릴게요"
          description="감시가 아니라 도움이에요. 서비스 이용에 꼭 필요한 동의예요."
          registerRef={(el) => (stepRefs.current[3] = el)}
        >
          <p className={styles['privacy-note']}>
            🔒 졸음·자세 감지는 내 브라우저에서만 처리되며 영상은 서버로
            전송되지 않아요.
          </p>

          <div className={styles['consent-group']}>
            <ConsentToggle
              emoji="😴"
              label="졸음 감지"
              checked={drowsinessConsent}
              onChange={setDrowsinessConsent}
            />
            <ConsentToggle
              emoji="🧍"
              label="자세 감지"
              checked={postureConsent}
              onChange={setPostureConsent}
            />
            <ConsentToggle
              emoji="🎬"
              label="학습 장면 저장"
              checked={captureConsent}
              onChange={setCaptureConsent}
            />
          </div>

          {/*
            앞의 둘은 좌표만 읽고 버리지만 이건 사진이 남는다. 무엇이 다른지 적어 두지 않으면
            "다 브라우저에서 처리된다"는 위 문구에 묻혀 그냥 켜게 된다.

            이건 필수가 아니다 — detectionConsented 에 넣지 않는다. 타임랩스를 안 켜도
            자세 교정과 집중도 분석은 그대로 동작한다.
          */}
          <p className={styles['privacy-note']}>
            🎬 학습 장면 저장을 켜면 공부하는 동안 10초에 한 번씩 화면을 담아
            종료 화면에서 타임랩스로 보여드려요. 사진은 내 브라우저에만 저장되고
            서버로 올라가지 않으며, 창을 닫으면 지워져요. 켜지 않아도 시작할 수
            있어요.
          </p>

          {/* 버튼이 왜 눌리지 않는지 알려준다. 이 안내가 없으면 꺼진 토글과 비활성 버튼을
              연결짓지 못하고 아래 체크박스만 계속 눌러 보게 된다. */}
          {!detectionConsented && (
            <p className={styles['consent-required']} role="status">
              두 감지 모두 동의해야 각잡고를 시작할 수 있어요. 감지 없이는 자세
              교정과 집중도 분석이 동작하지 않습니다.
            </p>
          )}

          <label className={styles['agree-row']}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>위 내용에 동의합니다</span>
          </label>

          {error && (
            <p className={styles['error']} role="alert">
              {error}
            </p>
          )}

          <div className={styles['step-actions']}>
            <button
              type="button"
              onClick={() => goPrev(4)}
              className={styles['prev-btn']}
            >
              이전
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
              className={styles['submit-btn']}
            >
              {submitting ? '저장하는 중...' : '시작하기'}
            </button>
          </div>
        </StepSection>
      </div>
    </div>
  );
}

interface StepSectionProps {
  index: number;
  openedStep: number;
  title: string;
  description: string;
  registerRef: (el: HTMLElement | null) => void;
  children: React.ReactNode;
}

/**
 * 한 단계.
 *
 * 아직 열리지 않은 단계는 렌더링하지 않는다. 화면에 숨겨두기만 하면 탭 이동으로
 * 접근되고 스크린리더에도 읽혀서, "다음을 누르기 전에는 보이지 않는다"는 요구와 어긋난다.
 */
function StepSection({
  index,
  openedStep,
  title,
  description,
  registerRef,
  children,
}: StepSectionProps) {
  if (index > openedStep) return null;

  return (
    <section
      ref={registerRef}
      tabIndex={-1}
      aria-current={index === openedStep ? 'step' : undefined}
      className={styles['step']}
      data-active={index === openedStep}
    >
      <p className={styles['step-badge']}>
        {index} / {TOTAL_STEPS} 단계
      </p>
      <h2 className={styles['step-title']}>{title}</h2>
      <p className={styles['step-desc']}>{description}</p>
      {children}
    </section>
  );
}

interface ConsentToggleProps {
  emoji: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function ConsentToggle({
  emoji,
  label,
  checked,
  onChange,
}: ConsentToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={styles['consent-card']}
      data-on={checked}
    >
      <span className={styles['consent-emoji']} aria-hidden>
        {emoji}
      </span>
      <span className={styles['consent-label']}>{label}</span>
      <span className={styles['consent-state']}>{checked ? 'ON' : 'OFF'}</span>
    </button>
  );
}
