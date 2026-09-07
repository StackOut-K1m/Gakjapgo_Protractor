// src/components/friend/FriendProfileModal.tsx
import { useEffect, useRef, useState } from 'react';

import { getApiErrorMessage } from '@/api/client';
import { getFriendProfile } from '@/api/friendApi';
import type { FriendProfile } from '@/types/friend';
import { formatStudyTime } from '@/utils/formatStudyTime';
import { MessageCircleIcon, UserMinusIcon } from './icons';
import styles from './FriendProfileModal.module.css';

interface FriendProfileModalProps {
  memberId: number;
  /** 목록에서 이미 아는 닉네임. 조회가 끝나기 전에도 제목을 채워 준다 */
  nickname: string;
  onClose: () => void;
  onOpenDm: () => void;
  onRemove: () => void;
}

/**
 * 친구 프로필 카드.
 *
 * 마이페이지와 같은 화면을 만들 수 없다 — 서버가 주는 것은 닉네임·사진·가입일과 학습 요약
 * 세 값뿐이다. 이메일·캘린더·주간 자세율·AI 리포트·참여 스터디는 친구 프로필 API 에 없고,
 * 남의 것을 공개할 이유도 없다. 그래서 받은 값만으로 채우는 압축 카드로 만든다.
 *
 * 라우트를 두지 않는다. 주소로 남의 프로필을 열 수 없는 편이 프라이버시에 맞고,
 * 이 카드에 담긴 값도 그만큼 적다.
 */
export default function FriendProfileModal({
  memberId,
  nickname,
  onClose,
  onOpenDm,
  onRemove,
}: FriendProfileModalProps) {
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // 열리자마자 닫기 버튼에 초점을 준다. 키보드만 쓰는 경우 카드 밖에 초점이 남으면
  // Esc 말고는 빠져나올 방법을 찾기 어렵다(ProfileDialog 와 같은 방식).
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

  useEffect(() => {
    let alive = true;
    getFriendProfile(memberId)
      .then((data) => {
        if (alive) setProfile(data);
      })
      .catch((e) => {
        if (!alive) return;
        // 403 은 그 사이 관계가 끊긴 경우다. 목록은 카드를 닫은 뒤 갱신된다.
        setError(getApiErrorMessage(e, '프로필을 불러오지 못했습니다.'));
      });
    return () => {
      alive = false;
    };
  }, [memberId]);

  const summary = profile?.studySummary;

  return (
    <div className={styles['backdrop']} onClick={onClose} role="presentation">
      <div
        className={styles['dialog']}
        role="dialog"
        aria-modal="true"
        aria-label={`${nickname} 프로필`}
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
          <span className={styles['avatar']}>
            {profile?.profileImageUrl ? (
              <img src={profile.profileImageUrl} alt="" />
            ) : (
              nickname.slice(0, 2)
            )}
          </span>
          <p className={styles['name']}>{profile?.nickname ?? nickname}</p>
          <p className={styles['joined']}>
            {profile ? `가입일 ${formatJoinedAt(profile.joinedAt)}` : ' '}
          </p>
        </div>

        {error ? (
          <p className={styles['error']} role="alert">
            {error}
          </p>
        ) : (
          <dl className={styles['stats']}>
            <div className={styles['stat']}>
              <dt>누적 학습</dt>
              <dd>
                {summary ? formatStudyTime(summary.totalFocusedSeconds) : '-'}
              </dd>
            </div>
            <div className={styles['stat']}>
              <dt>최근 7일</dt>
              <dd>
                {summary
                  ? formatStudyTime(summary.recent7DaysFocusedSeconds)
                  : '-'}
              </dd>
            </div>
            <div className={styles['stat']}>
              <dt>연속 학습</dt>
              <dd>{summary ? `${summary.streakDays}일` : '-'}</dd>
            </div>
          </dl>
        )}

        <div className={styles['actions']}>
          <button
            type="button"
            onClick={onOpenDm}
            className={styles['action-btn']}
            data-variant="primary"
          >
            <MessageCircleIcon size={16} />
            DM 전송
          </button>
          <button
            type="button"
            onClick={onRemove}
            className={styles['action-btn']}
            data-variant="danger"
          >
            <UserMinusIcon size={16} />
            친구 삭제
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 가입일을 'YYYY.MM.DD' 로 만든다.
 *
 * toLocaleDateString('ko-KR') 은 '2026. 1. 10.' 처럼 점과 공백이 섞여 나와, 한 줄에 넣기에
 * 지저분하다. 값이 서버의 LocalDateTime 문자열이라 파싱이 실패할 수도 있어 그때는 원본을 둔다.
 */
function formatJoinedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day}`;
}
