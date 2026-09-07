// src/components/study/StretchingCallPanel.tsx
import { createPortal } from 'react-dom';

import styles from './StretchingCallPanel.module.css';

interface StretchingCallPanelProps {
  /** 이 창의 body 에 그린다 */
  pipWindow: Window;
  /** 경고가 쌓인 부위 이름 (예: '거북목'). 왜 불려 나왔는지 알려준다 */
  triggerLabel: string;
  /** 큰 창으로 돌아가 스트레칭을 시작한다 */
  onGo: () => void;
}

/**
 * 스트레칭이 시작됐을 때 작은 창에 대신 뜨는 호출 판.
 *
 * <p>
 * 예전에는 스트레칭이 시작되면 작은 창을 그냥 닫아 버렸다. 큰 창을 최소화해 둔 사람에게는
 * 그 순간 화면에서 아무것도 남지 않아서, 스트레칭이 시작된 줄도 모른 채 계속 다른 일을 하게
 * 된다. 브라우저는 사용자가 누르지 않은 창을 스스로 띄우지 못하게 막으므로
 * (포커스 훔치기 방지) 자동으로 큰 창을 올릴 방법도 없다.
 *
 * <p>
 * 그래서 창을 닫는 대신 <b>누를 것</b>을 남긴다. 작은 창은 늘 맨 위에 떠 있어서 큰 창이
 * 최소화돼 있어도 보이고, 이 버튼을 누르는 그 클릭이 곧 큰 창을 띄울 수 있는
 * 사용자 제스처가 된다.
 *
 * <p>
 * <b>영상은 넣지 않는다.</b> 스트레칭 동작 판정이 큰 창의 &lt;video&gt; 를 보고 있는데,
 * 로컬 스트림을 붙일 요소가 둘이 되면 어느 쪽을 읽을지가 렌더 순서에 따라 달라진다
 * (StudyPipPanel 주석 참고).
 */
export default function StretchingCallPanel({
  pipWindow,
  triggerLabel,
  onGo,
}: StretchingCallPanelProps) {
  return createPortal(
    <div className={styles['call-panel']} role="alert">
      <span className={styles['call-icon']} aria-hidden>
        🧘
      </span>

      <p className={styles['call-title']}>스트레칭할 시간이에요</p>
      <p className={styles['call-desc']}>
        {triggerLabel} 경고가 쌓였습니다. 큰 화면에서 동작을 따라 해야 넘어갈 수
        있어요.
      </p>

      {/* 이 클릭이 큰 창을 띄우는 제스처다. autoFocus 는 걸지 않는다 —
          초점이 옮겨 가면서 작은 창이 큰 창 뒤로 밀릴 수 있다. */}
      <button type="button" onClick={onGo} className={styles['call-btn']}>
        스트레칭 하러 가기
      </button>
    </div>,
    pipWindow.document.body,
  );
}
