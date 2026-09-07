// src/components/study/RoomSidebar.tsx
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { splitByLinks } from '@/lib/text/linkify';
import type { ChatMessage, Participant } from '../../types/room';
import { getApiErrorMessage } from '@/api/client';
import { useFriendStore } from '@/stores/useFriendStore';
import type { FriendRelationStatus } from '@/types/friend';
import { MicIcon, MicOffIcon, SendIcon } from './icons';
import ParticipantMenu from './ParticipantMenu';
import type { ParticipantMenuAction } from './ParticipantMenu';
import ProfileDialog from './ProfileDialog';
import type { ProfileTarget } from './ProfileDialog';
import styles from './RoomSidebar.module.css';

type SidebarTab = 'chat' | 'participants';

interface RoomSidebarProps {
  participants: Participant[];
  messages: ChatMessage[];
  onSendMessage: (body: string) => void;
  /** 펼쳐져 있는지. false 면 자리를 비우고 감춘다(요소는 남는다). */
  open: boolean;
  /**
   * 개발용 — 아직 친구가 아닌 참여자를 '받은 요청' 상태로 보이게 한다.
   *
   * 친구 API 가 붙은 지금은 실제로 이 상태를 만들 수 있지만(다른 계정으로 신청),
   * 계정 둘을 띄우지 않고 메뉴 분기를 확인하려면 여전히 편하다.
   */
  devIncomingFriendRequests?: boolean;
}

/**
 * 방 오른쪽 사이드바(채팅 · 참여자).
 *
 * 탭을 바꿔도 두 목록을 모두 남겨 두고 숨기기만 한다. 조건부 렌더로 지웠다 다시 만들면
 * 탭을 누를 때마다 메시지 수십 개의 DOM 을 새로 만들게 되는데, 이 화면은 자세 추론이
 * 메인 스레드를 쓰고 있어서 그 비용이 끊김으로 보인다.
 */
function RoomSidebar({
  participants,
  messages,
  onSendMessage,
  open,
  devIncomingFriendRequests = false,
}: RoomSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('chat');
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLUListElement | null>(null);
  /** 프로필 카드를 열어 둔 대상. null 이면 닫힌 상태다. */
  const [profileTarget, setProfileTarget] = useState<ProfileTarget | null>(
    null,
  );
  /**
   * 지금 메뉴가 열려 있는 참여자와, 메뉴를 붙일 기준 요소.
   * 한 번에 하나만 열리도록 상태를 하나만 둔다.
   */
  const [menuFor, setMenuFor] = useState<{
    participant: Participant;
    anchor: HTMLElement;
  } | null>(null);

  /**
   * memberId → 프로필 사진. 채팅 말풍선의 사진을 여기서 찾는다.
   *
   * 메시지에 사진 주소를 실어 보내지 않는 이유는, 같은 사람이 100번 말하면 같은 값이 100번
   * 오가기 때문이다. 참여자 목록에 이미 있는 값을 authorId 로 찾아 쓰면 된다.
   * 방을 나간 사람의 지난 메시지는 목록에 없어 첫 글자로 돌아간다 — 그 편이 옳다.
   */
  const imageByMemberId = useMemo(
    () => new Map(participants.map((p) => [p.id, p.profileImageUrl])),
    [participants],
  );

  /** 아직 안 되는 동작을 눌렀을 때의 안내. 잠시 뒤 스스로 사라진다. */
  const [notice, setNotice] = useState<string | null>(null);

  const relations = useFriendStore((s) => s.relations);
  const loadFriends = useFriendStore((s) => s.loadFriends);
  const resolveRelation = useFriendStore((s) => s.resolve);
  const requestFriend = useFriendStore((s) => s.request);
  const acceptFriend = useFriendStore((s) => s.accept);
  const rejectFriend = useFriendStore((s) => s.reject);

  /** 메뉴를 열면서 관계를 확인 중인 상대. 그동안 친구 항목을 감춘다 */
  const [resolvingFor, setResolvingFor] = useState<string | null>(null);

  // 수락된 친구는 방에 들어올 때 한 번에 받아 둔다. 참여자마다 따로 물으면 요청이 인원수만큼 난다.
  useEffect(() => {
    loadFriends().catch((e) => {
      console.warn('[친구] 목록을 불러오지 못했습니다', e);
    });
  }, [loadFriends]);

  /**
   * 이 상대와의 관계. 개발용 토글이 켜져 있으면 아직 아무 사이도 아닌 사람을
   * '받은 요청'으로 바꿔 보여 준다 — 계정 둘을 띄우지 않고 분기를 확인하려는 용도다.
   */
  function resolveFriendStatus(memberId: string): FriendRelationStatus {
    const stored = relations[memberId]?.status ?? 'NONE';
    if (devIncomingFriendRequests && stored === 'NONE') return 'INCOMING';
    return stored;
  }

  /** 참여자 아이템 클릭 — 같은 사람을 다시 누르면 닫고, 다른 사람을 누르면 그쪽으로 옮긴다. */
  function handleParticipantClick(
    participant: Participant,
    element: HTMLElement,
  ) {
    const closing = menuFor?.participant.id === participant.id;
    setMenuFor(closing ? null : { participant, anchor: element });
    if (closing || participant.isSelf) return;

    // 메뉴를 열 때 이 사람과의 관계를 확인한다. 목록으로는 수락된 친구만 알 수 있어서,
    // 내가 신청해 뒀는지 상대가 신청했는지는 여기서 따로 물어야 한다.
    // 이미 친구인 게 확인된 사람은 다시 묻지 않는다 — 메뉴에 띄울 친구 항목이 없다.
    if (relations[participant.id]?.status === 'ACCEPTED') return;

    setResolvingFor(participant.id);
    resolveRelation(participant.id, participant.name)
      .catch((e) => console.warn('[친구] 관계를 확인하지 못했습니다', e))
      .finally(() =>
        setResolvingFor((prev) => (prev === participant.id ? null : prev)),
      );
  }

  function handleMenuSelect(
    participant: Participant,
    action: ParticipantMenuAction,
  ) {
    setMenuFor(null);

    switch (action) {
      case 'profile':
        setProfileTarget({
          memberId: participant.id,
          name: participant.name,
          profileImageUrl: participant.profileImageUrl,
          isSelf: participant.isSelf,
        });
        break;
      case 'friend-request':
        runFriendAction(
          () => requestFriend(participant.id),
          `${participant.name}님에게 친구 신청을 보냈습니다`,
        );
        break;
      case 'friend-accept':
        runFriendAction(
          () => acceptFriend(participant.id),
          `${participant.name}님과 친구가 되었습니다`,
        );
        break;
      case 'friend-reject':
        runFriendAction(
          () => rejectFriend(participant.id),
          `${participant.name}님의 요청을 거절했습니다`,
        );
        break;
      case 'dm':
        // DM 은 서버에 /api/v1/dms 가 있지만 주고받을 화면이 아직 없다.
        // 보내지지 않는 메시지를 보낸 것처럼 보이면 안 되므로 안내만 띄운다.
        setNotice(
          `DM 은 아직 화면이 준비되지 않았습니다 (${participant.name})`,
        );
        break;
    }
  }

  /** 친구 동작 공통 — 성공하면 결과를, 실패하면 이유를 같은 자리에 띄운다. */
  function runFriendAction(action: () => Promise<void>, done: string) {
    action().then(
      () => setNotice(done),
      (e: unknown) =>
        setNotice(getApiErrorMessage(e, '요청을 처리하지 못했습니다.')),
    );
  }

  // 안내는 잠깐만 보여 준다. 다음 안내가 뜨면 타이머도 새로 잡힌다.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 새 메시지가 오면 아래로 붙여 둔다. 안 그러면 대화가 보이지 않는 곳에 쌓인다.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, tab]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    onSendMessage(body);
    setDraft('');
  }

  const chatVisible = tab === 'chat';

  return (
    <aside className={styles['room-sidebar']} data-open={open}>
      <div className={styles['sidebar-tabs']} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={chatVisible}
          onClick={() => setTab('chat')}
          className={styles['sidebar-tab']}
          data-active={chatVisible}
        >
          채팅
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!chatVisible}
          onClick={() => setTab('participants')}
          className={styles['sidebar-tab']}
          data-active={!chatVisible}
        >
          참여자 ({participants.length})
        </button>
      </div>

      <div className={styles['sidebar-panel']} hidden={!chatVisible}>
        {messages.length === 0 ? (
          <p className={styles['empty-state']}>아직 메시지가 없습니다.</p>
        ) : (
          <ul className={styles['message-list']} ref={listRef}>
            {messages.map((message, index) => {
              // 같은 사람이 같은 분에 이어 쓴 말은 한 덩어리로 본다.
              // sentAt 이 분 단위 표시 문자열이라, 이 비교가 곧 "같은 분"이 된다.
              const prev = index > 0 ? messages[index - 1] : null;
              const grouped =
                prev !== null &&
                prev.authorId === message.authorId &&
                prev.sentAt === message.sentAt;
              const authorImage = imageByMemberId.get(message.authorId);

              return (
                <li
                  key={message.id}
                  className={styles['message-item']}
                  // 내 메시지는 오른쪽, 남의 메시지는 왼쪽에 붙인다.
                  data-self={message.isSelf ? 'true' : undefined}
                  // 앞 말에 이어지는 메시지는 이름·시각을 접고 간격을 좁힌다.
                  data-grouped={grouped ? 'true' : undefined}
                  // 서버 확인 전인 메시지는 옅게 보여 준다. 전송이 끝나면 흐림이 풀린다.
                  data-pending={message.pending ? 'true' : undefined}
                >
                  {/* 내 말풍선은 오른쪽에 붙고 이름도 안 적으므로 사진을 두지 않는다.
                      내 프로필은 참여자 탭에서 연다. */}
                  {!message.isSelf &&
                    (grouped ? (
                      // 이어지는 말은 사진을 반복하지 않되, 말풍선이 위와 어긋나지 않게 자리는 비워 둔다.
                      <span className={styles['message-avatar-spacer']} />
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setProfileTarget({
                            memberId: message.authorId,
                            name: message.authorName,
                            profileImageUrl: authorImage,
                            isSelf: false,
                          })
                        }
                        className={styles['message-avatar']}
                        aria-label={`${message.authorName} 프로필 보기`}
                      >
                        {authorImage ? (
                          <img src={authorImage} alt="" />
                        ) : (
                          message.authorName.at(0)
                        )}
                      </button>
                    ))}

                  <div className={styles['message-content']}>
                    {!grouped && (
                      <p className={styles['message-meta']}>
                        {/* 내 이름은 굳이 반복하지 않는다. 오른쪽 정렬만으로 내 말인 게 드러난다 */}
                        {!message.isSelf && (
                          <span className={styles['message-author']}>
                            {message.authorName}
                          </span>
                        )}
                        <span className={styles['message-time']}>
                          {message.sentAt}
                        </span>
                      </p>
                    )}
                    <p className={styles['message-body']}>
                      {splitByLinks(message.body).map((segment, i) =>
                        segment.type === 'link' ? (
                          <a
                            // 조각은 본문이 바뀔 때 통째로 다시 만들어지므로 순번을 key 로 써도 된다.
                            key={i}
                            href={segment.href}
                            target="_blank"
                            // 남이 보낸 주소라 여는 쪽에 이 창을 넘기지 않는다.
                            rel="noopener noreferrer"
                            className={styles['message-link']}
                          >
                            {segment.value}
                          </a>
                        ) : (
                          segment.value
                        ),
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={handleSubmit} className={styles['message-form']}>
          <input
            type="text"
            value={draft}
            placeholder="메시지를 입력하세요..."
            aria-label="메시지 입력"
            onChange={(e) => setDraft(e.target.value)}
            className={styles['message-input']}
          />
          <button
            type="submit"
            aria-label="보내기"
            className={styles['message-send-btn']}
          >
            <SendIcon />
          </button>
        </form>
      </div>

      <ul className={styles['participant-list']} hidden={chatVisible}>
        {participants.map((participant) => (
          <li key={participant.id}>
            <button
              type="button"
              onClick={(e) =>
                handleParticipantClick(participant, e.currentTarget)
              }
              className={styles['participant-item']}
              // 메뉴가 열려 있는 동안 눌린 아이템을 계속 강조해 둔다.
              data-selected={menuFor?.participant.id === participant.id}
              aria-haspopup="menu"
              aria-expanded={menuFor?.participant.id === participant.id}
            >
              {/* 메뉴는 이 사진이 끝나는 자리에 왼쪽 끝을 맞춘다.
                  좌표를 직접 재므로 사진 크기를 바꿔도 값을 다시 맞출 필요가 없다. */}
              <span
                className={styles['participant-avatar']}
                data-menu-align="before"
              >
                {participant.profileImageUrl ? (
                  <img src={participant.profileImageUrl} alt="" />
                ) : (
                  participant.name.at(0)
                )}
              </span>
              <span className={styles['participant-name']}>
                {participant.name}
                {participant.isSelf && (
                  <span className={styles['participant-sub']}>(나)</span>
                )}
              </span>
              <span
                className={styles['participant-mic']}
                data-off={!participant.micOn}
              >
                {participant.micOn ? (
                  <MicIcon size={16} />
                ) : (
                  <MicOffIcon size={16} />
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {notice && (
        <p className={styles['sidebar-notice']} role="status">
          {notice}
        </p>
      )}

      {menuFor && (
        <ParticipantMenu
          anchor={menuFor.anchor}
          participantName={menuFor.participant.name}
          isSelf={menuFor.participant.isSelf}
          friendStatus={resolveFriendStatus(menuFor.participant.id)}
          friendLoading={resolvingFor === menuFor.participant.id}
          onSelect={(action) => handleMenuSelect(menuFor.participant, action)}
          onClose={() => setMenuFor(null)}
        />
      )}

      {profileTarget && (
        <ProfileDialog
          target={profileTarget}
          onClose={() => setProfileTarget(null)}
        />
      )}
    </aside>
  );
}

export default memo(RoomSidebar);
