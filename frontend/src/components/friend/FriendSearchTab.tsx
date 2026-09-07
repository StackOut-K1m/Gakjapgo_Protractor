// src/components/friend/FriendSearchTab.tsx
import { useEffect, useRef } from 'react';

import { useFriendSearch } from '@/hooks/useFriendSearch';
import type { FriendAction } from '@/lib/friend/relationship';
import type { FriendItem } from '@/types/friend';
import FriendFinderRow from './FriendFinderRow';
import { SearchIcon } from './icons';
import styles from './FriendFinderModal.module.css';

interface FriendSearchTabProps {
  /** 지금 처리 중인 상대. 그 줄의 버튼만 잠근다 */
  busyMemberId: number | null;
  onAction: (action: FriendAction, item: FriendItem) => void;
  /**
   * 이 탭의 결과를 다시 받는 함수를 부모에게 올려 준다.
   *
   * 신청·수락은 부모(모달)가 처리하는데, 끝난 뒤 이 목록의 관계 상태도 새로 받아야 한다.
   * 검색어를 부모로 올리는 대신 재조회 함수를 넘기면 입력 상태는 이 탭에 남는다.
   */
  onReady: (refresh: () => void) => void;
}

/**
 * 회원 검색 탭. 닉네임으로 찾고 관계 상태에 맞는 버튼을 그린다.
 *
 * 본인·탈퇴 회원은 서버가 결과에서 빼 준다. 거절·차단 이력이 있는 상대도 `NONE` 으로 오므로
 * 화면은 그냥 '친구 신청'을 보여준다 — 서버가 거부하면 그때 안내 문구가 뜬다.
 */
export default function FriendSearchTab({
  busyMemberId,
  onAction,
  onReady,
}: FriendSearchTabProps) {
  const { keyword, setKeyword, results, loading, error, searched, refresh } =
    useFriendSearch();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 창을 열면 바로 칠 수 있게 한다. 이 탭에 들어온 목적이 검색이다.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 부모가 관계를 바꾼 뒤 이 목록을 다시 받을 수 있도록 함수를 올려 준다.
  useEffect(() => {
    onReady(refresh);
  }, [onReady, refresh]);

  return (
    <>
      <div className={styles['search']}>
        <span className={styles['search-icon']}>
          <SearchIcon size={16} />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="닉네임으로 회원 검색..."
          aria-label="닉네임으로 회원 검색"
          className={styles['search-input']}
        />
      </div>

      {error && (
        <p className={styles['state']} data-tone="error" role="alert">
          {error}
        </p>
      )}

      {!error && !searched && (
        <p className={styles['state']}>
          {loading ? '검색하는 중…' : '닉네임을 입력해 회원을 찾아보세요.'}
        </p>
      )}

      {!error && searched && results.length === 0 && !loading && (
        <p className={styles['state']}>검색 결과가 없습니다.</p>
      )}

      {results.length > 0 && (
        <ul className={styles['list']}>
          {results.map((item) => (
            <FriendFinderRow
              key={item.memberId}
              item={item}
              busy={busyMemberId === item.memberId}
              onAction={onAction}
            />
          ))}
        </ul>
      )}
    </>
  );
}
