// src/components/study/ProfileDialog.tsx
import { useEffect, useRef, useState } from 'react';

import { getApiErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  useFriendPending,
  useFriendRelation,
  useFriendStore,
} from '@/stores/useFriendStore';
import styles from './ProfileDialog.module.css';

/** 프로필을 열어 볼 대상. 방 안에서 아는 정보가 이게 전부다. */
export interface ProfileTarget {
  memberId: string;
  name: string;
  /** 참여자 목록에서 가져온다. 안 올렸으면 없고, 그때는 닉네임 첫 글자로 대신한다. */
  profileImageUrl?: string | null;
  isSelf: boolean;
}

interface ProfileDialogProps {
  target: ProfileTarget;
  onClose: () => void;
}

/** 관계별 버튼 문구. OUTGOING 은 누를 수 없다 */
const FRIEND_ACTION_LABEL = {
  NONE: '친구 신청',
  OUTGOING: '신청함 — 수락 대기 중',
  INCOMING: '친구 수락',
  ACCEPTED: '친구 취소',
} as const;

/**
 * 참여자·채팅에서 프로필 사진을 눌렀을 때 뜨는 카드.
 *
 * 친구는 실제 API(/api/v1/friends)를 부른다. 카드를 열 때 그 상대와의 관계를 서버에서
 * 확인하는데, 목록으로는 수락된 친구만 알 수 있어서 신청 중인지 받은 요청이 있는지는
 * 따로 물어야 하기 때문이다(useFriendStore.resolve 주석 참고).
 *
 * DM 은 아직 화면이 없어 안내만 띄운다. 서버에는 /api/v1/dms 가 있으므로 연동은 가능하다.
 */
export default function ProfileDialog({ target, onClose }: ProfileDialogProps) {
  const relation = useFriendRelation(target.memberId);
  const pending = useFriendPending(target.memberId);
  const resolve = useFriendStore((s) => s.resolve);
  const request = useFriendStore((s) => s.request);
  const accept = useFriendStore((s) => s.accept);
  const remove = useFriendStore((s) => s.remove);
  // 이메일은 내 것만 안다. 남의 이메일은 방 안에서 알 길이 없고, 알아야 할 이유도 없다.
  const myEmail = useAuthStore((s) => s.member?.email);

  const [dmNotice, setDmNotice] = useState(false);
  /** 친구 동작이 실패한 이유. 눌렀는데 아무 일도 안 일어난 것처럼 보이면 안 된다 */
  const [friendError, setFriendError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // 카드를 열 때 이 상대와의 관계를 확인한다. 실패해도 카드는 그대로 보여준다 —
  // 관계를 몰라도 프로필 자체는 볼 수 있어야 한다.
  useEffect(() => {
    if (target.isSelf) return;
    resolve(target.memberId, target.name).catch((e) => {
      console.warn('[친구] 관계를 확인하지 못했습니다', e);
    });
  }, [target.isSelf, target.memberId, target.name, resolve]);

  async function handleFriendAction() {
    setFriendError(null);
    try {
      if (relation.status === 'ACCEPTED') await remove(target.memberId);
      else if (relation.status === 'INCOMING') await accept(target.memberId);
      else await request(target.memberId);
    } catch (e) {
      setFriendError(getApiErrorMessage(e, '요청을 처리하지 못했습니다.'));
    }
  }

  // 열리자마자 닫기 버튼에 초점을 준다. 키보드만 쓰는 경우 카드 밖에 초점이 남으면
  // Esc 말고는 빠져나올 방법을 찾기 어렵다.
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

  // 남의 사진도 참여자 목록에 실려 온다. 예전에는 서버가 안 줘서 내 것만 보여 줬다.
  const profileImage = target.profileImageUrl;

  return (
    <div
      className={styles['backdrop']}
      // 카드 바깥을 누르면 닫는다. 카드 안쪽 클릭이 여기까지 올라오면 같이 닫히므로 막는다.
      onClick={onClose}
      role="presentation"
    >
      <div
        className={styles['dialog']}
        role="dialog"
        aria-modal="true"
        aria-label={`${target.name} 프로필`}
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

        <div className={styles['identity']}>
          {profileImage ? (
            <img src={profileImage} alt="" className={styles['avatar-image']} />
          ) : (
            <span className={styles['avatar-fallback']} aria-hidden>
              {target.name.at(0)}
            </span>
          )}

          <p className={styles['name']}>
            {target.name}
            {target.isSelf && <span className={styles['self-tag']}>나</span>}
          </p>

          {target.isSelf && myEmail && (
            <p className={styles['sub']}>{myEmail}</p>
          )}
        </div>

        {!target.isSelf && (
          <div className={styles['actions']}>
            <button
              type="button"
              onClick={handleFriendAction}
              // 내가 신청해 둔 상태에서는 할 수 있는 게 없다 — 취소 엔드포인트가 없고
              // 수락은 상대가 한다. 버튼을 살려 두면 눌러도 아무 일이 없다.
              disabled={pending || relation.status === 'OUTGOING'}
              className={styles['action-btn']}
              data-variant={
                relation.status === 'NONE' || relation.status === 'INCOMING'
                  ? 'primary'
                  : 'quiet'
              }
            >
              {pending ? '처리 중…' : FRIEND_ACTION_LABEL[relation.status]}
            </button>

            <button
              type="button"
              onClick={() => setDmNotice(true)}
              className={styles['action-btn']}
              data-variant="quiet"
            >
              DM 보내기
            </button>
          </div>
        )}

        {friendError && (
          <p className={styles['notice']} role="alert">
            {friendError}
          </p>
        )}

        {dmNotice && (
          <p className={styles['notice']} role="status">
            DM 은 아직 화면이 준비되지 않았습니다. 메시지를 주고받는 창이 붙기
            전까지는 보낼 수 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}
