// src/components/friend/DmWindow.tsx
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { useDmConversation } from '@/hooks/useDmConversation';
import { splitByLinks } from '@/lib/text/linkify';
import { DM_CONTENT_MAX_LENGTH } from '@/types/dm';
import { MessageCircleIcon, SendIcon } from './icons';
import styles from './DmWindow.module.css';

interface DmWindowProps {
  roomId: number;
  minimized: boolean;
  /** 친구 목록 패널이 펼쳐져 있으면 창을 그만큼 왼쪽으로 옮긴다 */
  panelOpen: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
  /** 창이 상대를 알아냈을 때. 친구 삭제 시 이 창을 닫을지 판단하는 데 쓴다 */
  onPeerResolved: (memberId: number) => void;
}

/**
 * 1:1 DM 창 — 화면 오른쪽 아래에 뜨는 플로팅 창.
 *
 * 동시에 하나만 열린다. 여러 개를 띄우면 그만큼 화면을 가리고, 어느 창에 쓰는지 헷갈린다.
 * 다른 사람과의 DM 을 열면 이 창이 교체된다.
 *
 * 최소화하면 제목 줄만 남는다. <b>그 동안 메시지를 조회하지 않는다</b> — 조회가 읽음 처리를
 * 겸해서, 보고 있지 않은 대화가 읽음으로 바뀌면 상대는 읽은 줄 안다.
 */
export default function DmWindow({
  roomId,
  minimized,
  panelOpen,
  onMinimize,
  onRestore,
  onClose,
  onPeerResolved,
}: DmWindowProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    peer,
    messages,
    loading,
    error,
    sending,
    hasOlder,
    loadOlder,
    send,
    myMemberId,
  } = useDmConversation(roomId, !minimized);

  // 상대를 알아내면 위로 올린다. 친구를 삭제할 때 이 창이 그 사람과의 것인지 판단해야 한다.
  const reportedPeer = useRef<number | null>(null);
  useEffect(() => {
    if (peer && reportedPeer.current !== peer.memberId) {
      reportedPeer.current = peer.memberId;
      onPeerResolved(peer.memberId);
    }
  }, [peer, onPeerResolved]);

  // 새 메시지가 오면 아래로 붙여 둔다. 안 그러면 대화가 보이지 않는 곳에 쌓인다.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, minimized]);

  // 펼치면 바로 쓸 수 있게 한다.
  useEffect(() => {
    if (!minimized) inputRef.current?.focus();
  }, [minimized]);

  const title = peer?.nickname ?? '대화';

  if (minimized) {
    return (
      <div className={styles['minimized']} data-shifted={panelOpen}>
        <button
          type="button"
          onClick={onRestore}
          className={styles['minimized-open']}
        >
          <MessageCircleIcon size={16} />
          <span className={styles['minimized-name']}>{title}</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className={styles['icon-btn']}
          aria-label="대화 닫기"
        >
          ✕
        </button>
      </div>
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    void send(body);
  }

  return (
    <section
      className={styles['window']}
      data-shifted={panelOpen}
      aria-label={`${title} 님과의 대화`}
    >
      <header className={styles['header']}>
        <span className={styles['avatar']}>
          {peer?.profileImageUrl ? (
            <img src={peer.profileImageUrl} alt="" />
          ) : (
            title.slice(0, 2)
          )}
        </span>
        <span className={styles['title']}>{title}</span>
        <button
          type="button"
          onClick={onMinimize}
          className={styles['icon-btn']}
          aria-label="대화 최소화"
          title="최소화"
        >
          －
        </button>
        <button
          type="button"
          onClick={onClose}
          className={styles['icon-btn']}
          aria-label="대화 닫기"
          title="닫기"
        >
          ✕
        </button>
      </header>

      <ul className={styles['messages']} ref={listRef}>
        {/* 지난 대화는 위로 이어 붙인다. 자동으로 받지 않는 이유는 조회가 읽음 처리를
            겸해서, 필요할 때만 부르는 편이 안전하기 때문이다. */}
        {hasOlder && (
          <li>
            <button
              type="button"
              onClick={() => void loadOlder()}
              className={styles['older-btn']}
            >
              지난 대화 더 보기
            </button>
          </li>
        )}

        {messages.length === 0 && !loading && (
          <li className={styles['empty']}>아직 대화가 없습니다.</li>
        )}

        {messages.map((message) => {
          const mine = message.senderMemberId === myMemberId;
          return (
            <li
              key={message.messageId}
              className={styles['message']}
              data-self={mine ? 'true' : undefined}
              data-pending={message.pending ? 'true' : undefined}
            >
              <p className={styles['bubble']}>
                {/* 상대가 보낸 주소는 새 탭으로 열고 이 창을 넘기지 않는다(rel) */}
                {splitByLinks(message.content).map((segment, i) =>
                  segment.type === 'link' ? (
                    <a
                      key={i}
                      href={segment.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles['link']}
                    >
                      {segment.value}
                    </a>
                  ) : (
                    segment.value
                  ),
                )}
              </p>
              <span className={styles['time']}>
                {message.pending ? '보내는 중…' : formatSentAt(message.sentAt)}
              </span>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className={styles['error']} role="status">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className={styles['form']}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={DM_CONTENT_MAX_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="메시지를 입력하세요..."
          aria-label="메시지 입력"
          className={styles['input']}
        />
        <button
          type="submit"
          disabled={sending || draft.trim().length === 0}
          className={styles['send-btn']}
          aria-label="보내기"
        >
          <SendIcon size={16} />
        </button>
      </form>
    </section>
  );
}

/** 보낸 시각을 'HH:MM' 으로. 형식이 예상과 다르면 그대로 둔다(스터디룸 채팅과 같은 규칙). */
function formatSentAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  });
}
