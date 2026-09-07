// src/components/study/PipParkedCover.tsx
import { PipIcon } from './icons';
import styles from './PipParkedCover.module.css';

interface PipParkedCoverProps {
  /** 큰 화면으로 돌아가기 (작은 창을 닫는다) */
  onReturn: () => void;
}

/**
 * 작은 창(PiP)으로 학습하는 동안 큰 창을 덮는 화면.
 *
 * <p>
 * 웹에서는 창 하나가 작은 창으로 <b>변신</b>할 수 없다 — Document Picture-in-Picture 는
 * 항상 새 창을 만들고 원래 창은 그대로 남으며, 창을 최소화하는 API 도 없다. 그대로 두면
 * 작은 창을 켠 뒤에도 큰 창에 스터디룸이 멀쩡히 보여서 "전환된 게 맞나" 싶게 된다.
 * 그래서 큰 창을 이 화면으로 덮어 한쪽만 보고 있으면 되도록 만든다.
 *
 * <p>
 * <b>덮기만 하고 지우지는 않는다.</b> 아래에는 참여자 타일이 그대로 살아 있어야 한다 —
 * 상대 영상·음성은 그 &lt;video&gt; 요소에 붙어 있어서, 화면에서 걷어내면 방 사람들의
 * 목소리가 같이 끊긴다.
 *
 * <p>
 * 창을 작게 줄여 구석으로 밀어 두는 방법도 있지만(스크립트로 연 팝업이라 resizeTo 가
 * 먹는다) 쓰지 않기로 했다. 어차피 작업 표시줄에는 그대로 남아 진짜 최소화가 되지
 * 않으면서, 포커스·멀티 모니터·복원 위치 같은 변수만 늘기 때문이다. 창은 원래 크기로
 * 두고 이 판만 덮는다.
 */
export default function PipParkedCover({ onReturn }: PipParkedCoverProps) {
  return (
    <div className={styles['parked-cover']} role="status">
      <span className={styles['parked-icon']} aria-hidden>
        <PipIcon size={40} />
      </span>

      <h2 className={styles['parked-title']}>작은 창에서 학습 중입니다</h2>
      <p className={styles['parked-desc']}>
        내 카메라와 자세 경고는 항상 위에 떠 있는 작은 창에서 계속 확인할 수
        있습니다. 다른 창으로 넘어가도 감지는 그대로 이어집니다.
      </p>
      <p className={styles['parked-desc']}>
        채팅과 참여자 목록, 아래 컨트롤바는 그대로 쓸 수 있습니다.
      </p>

      {/* autoFocus 를 걸면 안 된다 — 이 판은 작은 창이 열리는 순간 같이 붙는데,
          focus() 가 큰 창을 앞으로 끌어와 방금 연 작은 창을 덮어버린다 */}
      <button type="button" onClick={onReturn} className={styles['parked-btn']}>
        큰 화면으로 돌아가기
      </button>
    </div>
  );
}
