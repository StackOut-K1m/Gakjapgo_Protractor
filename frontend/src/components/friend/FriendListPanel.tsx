// src/components/friend/FriendListPanel.tsx
import { useMemo, useState } from 'react';

import { getApiErrorMessage } from '@/api/client';
import { openDmRoom } from '@/api/dmApi';
import { useDmSummaries } from '@/hooks/useDmSummaries';
import { useFriendActions } from '@/hooks/useFriendActions';
import { useFriends } from '@/hooks/useFriends';
import { useFriendDockStore } from '@/stores/useFriendDockStore';
import {
  filterByNickname,
  removeFriendConfirmMessage,
} from '@/lib/friend/relationship';
import type { FriendAction } from '@/lib/friend/relationship';
import type { FriendItem } from '@/types/friend';
import FriendFinderModal from './FriendFinderModal';
import FriendListItem from './FriendListItem';
import FriendProfileModal from './FriendProfileModal';
import {
  CollapseIcon,
  RefreshIcon,
  SearchIcon,
  UserPlusIcon,
  UsersIcon,
} from './icons';
import styles from './FriendListPanel.module.css';

interface FriendListPanelProps {
  /** 펼쳐져 있는지. 접혀도 요소는 남고 화면 밖으로 밀려난다 */
  open: boolean;
  onCollapse: () => void;
  /** 받은 친구 신청 건수. 친구 찾기 버튼에 배지로 붙인다 */
  requestCount: number;
  /** 신청 건수를 다시 받아야 할 때. 수락·거절로 건수가 줄기 때문이다 */
  onRequestsChanged: () => void;
}

/**
 * 친구 목록 패널.
 *
 * 이 목록은 `ACCEPTED` 관계만 담는다(GET /friends 가 그것만 준다). 그래서 항목 메뉴에는
 * 신청·수락이 없고 프로필·DM·삭제만 있다.
 *
 * 검색창은 <b>이미 받아 둔 목록을 거르는 로컬 필터</b>다. 친구가 아닌 사람을 찾는 일은
 * 헤더의 친구 추가(+) 버튼이 여는 별도 창이 맡는다 — 두 검색이 하는 일이 다르다.
 */
export default function FriendListPanel({
  open,
  onCollapse,
  requestCount,
  onRequestsChanged,
}: FriendListPanelProps) {
  const [keyword, setKeyword] = useState('');
  /** 지금 액션 패널을 펼쳐 둔 친구. 한 번에 하나만 열린다 */
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  /** 프로필 카드를 열어 둔 친구. null 이면 닫힌 상태다 */
  const [profileTarget, setProfileTarget] = useState<FriendItem | null>(null);
  /**
   * 관계 변경이 아닌 실패 안내(예: DM 방을 열지 못함).
   * 관계 변경 쪽 문구는 useFriendActions 가 따로 들고 있다.
   */
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);

  const { friends, loading, error, refresh, loadMore, hasMore, removeLocally } =
    useFriends(open);
  const actions = useFriendActions({ onChanged: refresh });
  // 목록 한 줄에 곁들일 마지막 대화·안 읽음 표시
  const dm = useDmSummaries(open);

  const openDm = useFriendDockStore((s) => s.openDm);
  const closeDm = useFriendDockStore((s) => s.closeDm);
  const openDmMemberId = useFriendDockStore((s) => s.openDmMemberId);
  // 친구 찾기 창은 알림에서도 열기 때문에 열림 상태가 스토어에 있다.
  const finderTab = useFriendDockStore((s) => s.finderTab);
  const openFinder = useFriendDockStore((s) => s.openFinder);
  const setFinderTab = useFriendDockStore((s) => s.setFinderTab);
  const closeFinder = useFriendDockStore((s) => s.closeFinder);

  /**
   * 접기. 열어 둔 메뉴와 지난 안내를 함께 정리한다 — 다시 펼쳤을 때 그것들이 남아 있으면
   * 언제 무엇을 눌러 나온 결과인지 알 수 없다.
   *
   * 효과로 `open` 을 감시하지 않고 여기서 처리하는 이유는, 효과 본문에서 setState 를 부르면
   * 렌더가 한 번 더 돌기 때문이다(react-hooks/set-state-in-effect). 접는 경로는 이 버튼뿐이라
   * 감시할 필요도 없다.
   */
  function handleCollapse() {
    setSelectedMemberId(null);
    setPendingNotice(null);
    // 창을 열어 둔 채로 접으면 배경만 남은 창이 화면을 덮는다.
    closeFinder();
    setProfileTarget(null);
    actions.clearNotice();
    onCollapse();
  }

  /** 관계가 바뀌었다 — 친구 목록과 받은 신청 배지를 함께 맞춘다 */
  function handleRelationshipChanged() {
    refresh();
    onRequestsChanged();
  }

  /**
   * 친구 삭제. 항목 메뉴와 프로필 카드가 함께 쓴다.
   *
   * 되돌릴 수 없고 지난 DM 도 못 보게 되므로 한 번 확인한다. 확인을 받으면 화면에서 먼저
   * 지운다 — 서버 응답을 기다리면 눌러도 잠깐 그대로 있어 안 눌린 것처럼 보인다.
   * 실패하면 onChanged(=refresh)가 다시 받아 오므로 되살아난다.
   */
  function removeFriend(friend: FriendItem) {
    if (!window.confirm(removeFriendConfirmMessage(friend.nickname))) return;
    // 그 사람과의 DM 창이 열려 있으면 함께 닫는다. 남겨 두면 다음 조회·전송이 모두 403 이다.
    if (openDmMemberId === friend.memberId) closeDm();
    removeLocally(friend.memberId);
    void actions.remove(friend.memberId);
  }

  /**
   * DM 창 열기. 방은 두 회원 쌍에 하나뿐이라, 이미 있으면 서버가 그 방을 돌려준다 —
   * "새 대화"와 "지난 대화 열기"를 구분할 필요가 없다.
   */
  async function handleOpenDm(friend: FriendItem) {
    try {
      const room = await openDmRoom(friend.memberId);
      openDm(room.roomId, friend.memberId);
      // 방을 열었으니 안 읽음 점을 지운다(그 방의 DM 알림도 읽음 처리한다).
      dm.markRoomSeen(room.roomId);
    } catch (e) {
      setPendingNotice(getApiErrorMessage(e, 'DM 방을 열지 못했습니다.'));
    }
  }

  const visible = useMemo(
    () => filterByNickname(friends, keyword),
    [friends, keyword],
  );

  function handleAction(friend: FriendItem, action: FriendAction) {
    setSelectedMemberId(null);
    setPendingNotice(null);

    if (action === 'remove') {
      removeFriend(friend);
      return;
    }
    if (action === 'profile') {
      setProfileTarget(friend);
      return;
    }
    if (action === 'dm') {
      void handleOpenDm(friend);
    }
  }

  // 동작 결과가 있으면 그것이 먼저다 — 임시 안내는 아직 없는 화면을 알리는 보조 문구다.
  const notice = actions.notice ?? pendingNotice;

  return (
    <>
      <aside
        className={styles['panel']}
        data-open={open}
        aria-label="친구 목록"
        aria-hidden={!open}
      >
        <div className={styles['header']}>
          <div className={styles['title-group']}>
            <span className={styles['title-icon']}>
              <UsersIcon size={18} />
            </span>
            <h2 className={styles['title']}>같이 달리는 친구</h2>
            {/* 조회 전에는 0 을 쓰지 않는다 — '0명'은 친구가 없다는 뜻으로 읽힌다 */}
            <span className={styles['count']}>
              {loading && friends.length === 0 ? '-' : `${friends.length}명`}
            </span>
          </div>

          <div className={styles['header-actions']}>
            <button
              type="button"
              className={styles['icon-btn']}
              aria-label={
                requestCount > 0
                  ? `친구 찾기 (받은 신청 ${requestCount}건)`
                  : '친구 찾기'
              }
              title={
                requestCount > 0
                  ? `받은 친구 신청 ${requestCount}건`
                  : '친구 찾기'
              }
              onClick={() => {
                setPendingNotice(null);
                openFinder('search');
              }}
            >
              <UserPlusIcon size={16} />
              {/* 받은 신청이 있으면 점을 찍는다. 펼친 상태에서는 원형 버튼 배지가 보이지
                  않으므로, 이 표시가 없으면 창을 열어 봐야만 알 수 있다. */}
              {requestCount > 0 && <span className={styles['icon-dot']} />}
            </button>
            <button
              type="button"
              className={styles['icon-btn']}
              aria-label="목록 새로 고침"
              title="새로 고침"
              disabled={loading}
              onClick={refresh}
            >
              <RefreshIcon size={16} />
            </button>
            <button
              type="button"
              className={styles['icon-btn']}
              aria-label="친구 목록 접기"
              title="접기"
              onClick={handleCollapse}
            >
              <CollapseIcon size={16} />
            </button>
          </div>
        </div>

        <div className={styles['search']}>
          <span className={styles['search-icon']}>
            <SearchIcon size={14} />
          </span>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="친구 이름 검색..."
            aria-label="친구 이름 검색"
            className={styles['search-input']}
          />
        </div>

        {error && (
          <p className={styles['state']} data-tone="error" role="alert">
            {error}
          </p>
        )}

        {!error && friends.length === 0 && (
          <p className={styles['state']}>
            {loading
              ? '친구 목록을 불러오는 중…'
              : '아직 친구가 없습니다. 위 + 버튼으로 친구를 찾아보세요.'}
          </p>
        )}

        {friends.length > 0 && visible.length === 0 && (
          <p className={styles['state']}>검색 결과가 없습니다.</p>
        )}

        {visible.length > 0 && (
          <ul className={styles['list']}>
            {visible.map((friend) => (
              <FriendListItem
                key={friend.memberId}
                friend={friend}
                selected={selectedMemberId === friend.memberId}
                busy={actions.busyMemberId === friend.memberId}
                lastMessage={dm.byMemberId.get(friend.memberId)?.lastMessage}
                lastMessageAt={
                  dm.byMemberId.get(friend.memberId)?.lastMessageAt
                }
                hasUnread={dm.hasUnread(friend.memberId)}
                onToggle={() =>
                  setSelectedMemberId((prev) =>
                    prev === friend.memberId ? null : friend.memberId,
                  )
                }
                onAction={(action) => handleAction(friend, action)}
              />
            ))}

            {/* 100명을 넘는 경우에만 나온다(한 번에 서버 최대치를 받는다) */}
            {hasMore && (
              <button
                type="button"
                className={styles['more-btn']}
                onClick={loadMore}
                disabled={loading}
              >
                {loading ? '불러오는 중…' : '더 보기'}
              </button>
            )}
          </ul>
        )}

        {notice && (
          <p className={styles['notice']} role="status">
            {notice}
          </p>
        )}
      </aside>

      {/*
       * 친구 찾기 창. 여기서 신청·수락·거절이 끝나면 친구 목록도 달라질 수 있으므로
       * (수락하면 새 친구가 생긴다) 같은 refresh 를 넘겨 준다.
       *
       * 패널 <aside> 밖에 두는 이유는 접힌 패널이 transform 을 쓰기 때문이다. transform 이
       * 걸린 요소는 그 안의 position: fixed 자손에게 새 기준점이 되어, 창이 화면이 아니라
       * 패널을 기준으로 배치된다. 밖에 두면 그 영향을 받지 않는다.
       */}
      {finderTab && (
        <FriendFinderModal
          tab={finderTab}
          onTabChange={setFinderTab}
          onClose={closeFinder}
          onRelationshipChanged={handleRelationshipChanged}
        />
      )}

      {/*
       * 프로필 카드. 삭제는 이 카드에서도 할 수 있어야 한다 — 상대의 학습 기록을 보고
       * 정리하는 흐름이 자연스럽다. 삭제하면 카드를 닫는다(볼 대상이 없어진다).
       */}
      {profileTarget && (
        <FriendProfileModal
          memberId={profileTarget.memberId}
          nickname={profileTarget.nickname}
          onClose={() => setProfileTarget(null)}
          onOpenDm={() => {
            const target = profileTarget;
            setProfileTarget(null);
            void handleOpenDm(target);
          }}
          onRemove={() => {
            const target = profileTarget;
            setProfileTarget(null);
            removeFriend(target);
          }}
        />
      )}
    </>
  );
}
