// src/components/study/PostureRecoveryCountdown.tsx
import { useEffect, useState } from 'react';

import styles from './PostureRecoveryCountdown.module.css';

/** 남은 시간을 다시 그리는 주기(ms). 소수 첫째 자리까지 보여주므로 그보다 촘촘할 필요가 없다 */
const TICK_MS = 100;

interface PostureRecoveryCountdownProps {
  /**
   * 경고가 모두 풀릴 것으로 보이는 시각(ms).
   *
   * 시작 시각 + 고정 길이가 아니라 <b>끝날 시각</b>을 받는다. 해제 조건이 판정마다 다르고
   * (서버 자세 2초, 턱 괴기 1초), 서버 판정은 응답이 늦어지는 만큼 밀린다. 그 사정을 아는
   * 쪽에서 계산하고, 여기서는 남은 시간만 그린다.
   */
  endsAt: number;
  /** 대신할 안내 문구의 클래스. 자리와 서식을 그대로 물려받는다 */
  className?: string;
  /**
   * 타이머를 걸 창. 기본은 이 문서의 창이다.
   *
   * 작은 창(PiP)에 그릴 때는 그 창을 넘긴다. 큰 창이 다른 앱에 가려지면 그쪽 타이머는
   * 1초 간격까지 느려져서 0.1초 단위 카운트다운이 뚝뚝 끊긴다. PiP 창은 늘 맨 위에 떠
   * 있어 그런 제약을 받지 않는다.
   */
  timerWindow?: Window;
}

/**
 * 자세를 고친 뒤 코칭 화면이 닫히기까지 남은 시간.
 *
 * <p>
 * 새 배너가 아니라 <b>기존 안내 문구를 바꿔 끼우는</b> 자리다. 평소에는 "바른 자세를 2초간
 * 유지하면 자동으로 이전 스터디룸 화면으로 돌아갑니다"가 있고, 실제로 고치기 시작하면 같은
 * 줄이 남은 시간을 센다. 안내와 카운트다운은 같은 말을 하므로 둘을 나란히 두면 어느 쪽을
 * 봐야 할지 헷갈린다.
 *
 * <p>
 * 실제 해소 판정은 서버가 한다 — 여기 숫자는 같은 규칙(바른 자세 응답 2회 연속)을 미리
 * 세어 보여주는 예고다. 전송이 1초에 한 번이라 서버가 알려 주는 시점과 최대 1초까지
 * 어긋날 수 있다. 0 에 닿아도 화면이 남아 있을 수 있는데, 그때 숫자가 음수로 내려가면
 * 고장으로 보이므로 0 에서 멈추고 문구만 바꾼다.
 */
export default function PostureRecoveryCountdown({
  endsAt,
  className,
  timerWindow,
}: PostureRecoveryCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const view = timerWindow ?? window;
    // 붙자마자 한 번 맞춰 둔다. 첫 tick 을 기다리면 이전 값이 잠깐 보인다.
    setNow(Date.now());
    const id = view.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => view.clearInterval(id);
  }, [endsAt, timerWindow]);

  const left = Math.max(0, (endsAt - now) / 1000);

  return (
    <p className={className} role="status" aria-live="polite">
      {left > 0 ? (
        <>
          바른 자세 유지 중 —{' '}
          <strong className={styles['recovery-seconds']}>
            {left.toFixed(1)}초
          </strong>{' '}
          후 자동으로 이전 스터디룸 화면으로 돌아갑니다.
        </>
      ) : (
        '자세가 회복됐습니다. 곧 이전 스터디룸 화면으로 돌아갑니다.'
      )}
    </p>
  );
}
