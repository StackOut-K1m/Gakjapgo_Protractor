// src/components/study/RoomPasswordDialog.tsx
//
// 비공개 방에 들어가기 전 비밀번호를 받는 창.
//
// 준비 화면이 아니라 여기서 받는 이유는, 카메라를 켜고 자세를 잡은 뒤에 "비밀번호가 틀렸다"고
// 되돌려 보내면 그 준비가 통째로 헛수고가 되기 때문이다.
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import styles from './RoomPasswordDialog.module.css';

interface RoomPasswordDialogProps {
  /** 어느 방에 들어가는지 확인시켜 준다. 방을 잘못 고른 걸 여기서 알아챌 수 있다 */
  roomTitle: string;
  /** 서버가 거절했을 때 보여줄 문구. null 이면 안 띄운다 */
  error?: string | null;
  /** 서버에 확인하는 중. 같은 값을 두 번 보내지 않게 버튼을 잠근다 */
  submitting?: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export default function RoomPasswordDialog({
  roomTitle,
  error = null,
  submitting = false,
  onSubmit,
  onCancel,
}: RoomPasswordDialogProps) {
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 창이 뜨면 바로 칠 수 있게 커서를 넣는다. 비밀번호 하나 받자고 클릭을 더 시킬 이유가 없다.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Esc 로 닫는다. 배경을 눌러 닫는 것과 함께, 갇힌 느낌이 들지 않게 하는 최소한의 탈출구다.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    onSubmit(password);
  }

  return (
    <div
      className={styles['backdrop']}
      onClick={onCancel}
      role="presentation"
    >
      {/* 안쪽 클릭이 배경까지 올라가면 입력하는 도중에 창이 닫힌다 */}
      <div
        className={styles['dialog']}
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-password-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="room-password-title" className={styles['title']}>
          비공개 방입니다
        </h2>
        <p className={styles['room-title']}>{roomTitle}</p>

        <form onSubmit={handleSubmit} className={styles['form']}>
          <label htmlFor="room-password-input" className={styles['label']}>
            입장 비밀번호
          </label>
          <input
            id="room-password-input"
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={password}
            placeholder="숫자 비밀번호"
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
            className={styles['input']}
          />

          {error && (
            <p className={styles['error']} role="alert">
              {error}
            </p>
          )}

          <div className={styles['actions']}>
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className={styles['cancel-btn']}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!password || submitting}
              className={styles['submit-btn']}
            >
              {submitting ? '확인 중…' : '입장하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
