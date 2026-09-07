// src/components/study/ConsentRequiredDialog.tsx
//
// 감지 동의를 철회한 사용자가 스터디룸에 들어가려 할 때 띄운다.
//
// 철회 자체는 막지 않는다(철회권). 대신 철회한 상태로는 방에 들어갈 수 없다 —
// 자세·졸음 감지가 이 서비스의 전제라, 동의 없이 들어가면 감지가 꺼진 빈 껍데기이거나
// 동의하지 않은 감지가 도는 둘 중 하나가 된다.
import { useEffect } from 'react';

import styles from './ConsentRequiredDialog.module.css';

interface ConsentRequiredDialogProps {
  /** 동의 설정 화면으로 보낸다 */
  onGoToSettings: () => void;
  onCancel: () => void;
}

export default function ConsentRequiredDialog({
  onGoToSettings,
  onCancel,
}: ConsentRequiredDialogProps) {
  // Esc 로 닫는다. 배경 클릭과 함께 갇힌 느낌을 없애는 최소한의 탈출구다.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className={styles['backdrop']} onClick={onCancel} role="presentation">
      <div
        className={styles['dialog']}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-required-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="consent-required-title" className={styles['title']}>
          감지 동의가 필요합니다
        </h2>
        <p className={styles['body']}>
          자세 감지와 졸음 감지에 동의해야 스터디룸을 이용할 수 있어요. 지금은
          동의가 철회된 상태라 입장할 수 없습니다.
        </p>
        <p className={styles['note']}>
          🔒 감지는 내 브라우저에서만 처리되며 영상은 서버로 전송되지 않아요.
        </p>

        <div className={styles['actions']}>
          <button
            type="button"
            onClick={onCancel}
            className={styles['cancel-btn']}
          >
            나중에
          </button>
          <button
            type="button"
            onClick={onGoToSettings}
            className={styles['submit-btn']}
          >
            동의 설정으로 이동
          </button>
        </div>
      </div>
    </div>
  );
}
