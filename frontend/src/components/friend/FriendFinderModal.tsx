// src/components/friend/FriendFinderModal.tsx
import { useCallback, useEffect, useRef } from 'react';

import { canRespondToRequest } from '@/api/friendApi';
import { useFriendActions } from '@/hooks/useFriendActions';
import { useIncomingRequests } from '@/hooks/useIncomingRequests';
import type { FinderTab } from '@/stores/useFriendDockStore';
import type { FriendAction } from '@/lib/friend/relationship';
import type { FriendItem } from '@/types/friend';
import FriendRequestsTab from './FriendRequestsTab';
import FriendSearchTab from './FriendSearchTab';
import styles from './FriendFinderModal.module.css';

interface FriendFinderModalProps {
  /** 열려 있는 탭. 알림에서 열 때 '받은 요청'으로 바로 들어오기 때문에 밖에서 정한다 */
  tab: FinderTab;
  onTabChange: (tab: FinderTab) => void;
  onClose: () => void;
  /** 관계가 바뀌었다. 친구 목록 패널이 이 신호로 목록을 다시 받는다 */
  onRelationshipChanged: () => void;
}

/**
 * 친구 찾기 창 — `회원 검색`과 `받은 요청` 두 탭.
 *
 * 패널이 아니라 모달로 만든 이유는 폭이다. 받은 요청 줄에는 버튼이 두 개(수락·거절) 들어가고
 * 검색 결과에도 상태 문구가 붙는데, 300px 패널 안에서는 이름이 먼저 잘린다. 모달이면
 * 뒤에 친구 목록이 그대로 남아 "이 사람이 이미 친구였나"를 확인하러 창을 오갈 필요도 없다.
 *
 * 받은 요청 목록을 이 창이 들고 있는 이유는 탭 제목의 건수 배지가 같은 값을 써야 하고,
 * 수락·거절 뒤 재조회도 여기서 함께 처리해야 하기 때문이다.
 */
export default function FriendFinderModal({
  tab,
  onTabChange,
  onClose,
  onRelationshipChanged,
}: FriendFinderModalProps) {
  const {
    requests,
    loading: requestsLoading,
    error: requestsError,
    refresh: refreshRequests,
  } = useIncomingRequests();

  /**
   * 검색 결과를 다시 받는 함수. 검색어는 검색 탭이 들고 있으므로 함수만 받아 둔다.
   * 관계를 바꾼 뒤 이걸 부르지 않으면 그 줄이 옛 상태(예: '친구 신청')로 남는다.
   */
  const refreshSearch = useRef<(() => void) | null>(null);
  const handleSearchReady = useCallback((refresh: () => void) => {
    refreshSearch.current = refresh;
  }, []);

  const handleChanged = useCallback(() => {
    refreshSearch.current?.();
    refreshRequests();
    onRelationshipChanged();
  }, [refreshRequests, onRelationshipChanged]);

  const actions = useFriendActions({ onChanged: handleChanged });

  // Esc 로 닫는다. 배경 클릭과 함께, 마우스만 쓰는 경우와 키보드만 쓰는 경우를 모두 덮는다.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleAction(action: FriendAction, item: FriendItem) {
    if (action === 'request') {
      void actions.request(item.memberId);
      return;
    }
    if (action === 'accept' || action === 'reject') {
      // friendshipId 는 NONE 일 때 null 이라, 그대로 경로에 넣으면 /requests/null/accept 가 된다.
      if (!canRespondToRequest(item)) {
        // 목록이 낡아 버튼이 남아 있는 경우다. 다시 받아 화면을 맞춘다.
        handleChanged();
        return;
      }
      const run = action === 'accept' ? actions.accept : actions.reject;
      void run(item.memberId, item.friendshipId);
    }
  }

  return (
    <div className={styles['backdrop']} onClick={onClose} role="presentation">
      <div
        className={styles['dialog']}
        role="dialog"
        aria-modal="true"
        aria-label="친구 찾기"
        // 창 안쪽 클릭이 배경까지 올라가면 같이 닫힌다
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles['header']}>
          <h2 className={styles['title']}>친구 찾기</h2>
          <button
            type="button"
            onClick={onClose}
            className={styles['close-btn']}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className={styles['tabs']} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'search'}
            onClick={() => onTabChange('search')}
            className={styles['tab']}
            data-active={tab === 'search'}
          >
            회원 검색
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'requests'}
            onClick={() => onTabChange('requests')}
            className={styles['tab']}
            data-active={tab === 'requests'}
          >
            받은 요청
            {/* 0건일 때는 배지를 두지 않는다 — '0'이 붙어 있으면 처리할 것이 있는 듯 보인다 */}
            {requests.length > 0 && (
              <span className={styles['tab-badge']}>{requests.length}</span>
            )}
          </button>
        </div>

        <div className={styles['body']}>
          {/*
           * 탭을 바꿔도 검색 탭은 지우지 않고 감춘다. 지웠다 다시 만들면 입력한 검색어와
           * 결과가 사라져서, 요청 하나 확인하고 돌아온 사람이 처음부터 다시 쳐야 한다.
           */}
          <div hidden={tab !== 'search'}>
            <FriendSearchTab
              busyMemberId={actions.busyMemberId}
              onAction={handleAction}
              onReady={handleSearchReady}
            />
          </div>

          {tab === 'requests' && (
            <FriendRequestsTab
              requests={requests}
              loading={requestsLoading}
              error={requestsError}
              busyMemberId={actions.busyMemberId}
              onAction={handleAction}
            />
          )}
        </div>

        {actions.notice && (
          <p className={styles['notice']} role="status">
            {actions.notice}
          </p>
        )}
      </div>
    </div>
  );
}
