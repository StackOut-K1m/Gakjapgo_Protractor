// src/components/study/ParticipantMenu.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { FriendRelationStatus } from '@/types/friend';
import styles from './ParticipantMenu.module.css';

/** 메뉴에서 고를 수 있는 동작. 실제 처리는 부모가 맡는다. */
export type ParticipantMenuAction =
  'profile' | 'friend-request' | 'friend-accept' | 'friend-reject' | 'dm';

interface ParticipantMenuProps {
  /** 메뉴를 띄울 기준이 되는 참여자 아이템 */
  anchor: HTMLElement;
  participantName: string;
  isSelf: boolean;
  friendStatus: FriendRelationStatus;
  /** 관계를 아직 서버에서 확인하는 중인지. 그동안은 친구 항목을 감춘다 */
  friendLoading?: boolean;
  onSelect: (action: ParticipantMenuAction) => void;
  onClose: () => void;
}

interface MenuPosition {
  left: number;
  top: number;
  /** 위로 뒤집혀 열렸는지 — 애니메이션 방향을 맞추는 데 쓴다 */
  flipped: boolean;
}

/** 메뉴와 기준 아이템 사이 간격(px) */
const ANCHOR_GAP = 4;
/** 창 가장자리에서 이만큼은 띄운다(px) */
const VIEWPORT_MARGIN = 8;

/**
 * 아이템 안에서 프로필 사진이 끝나는 x 좌표.
 * 표시가 없으면 null 을 돌려주고, 부르는 쪽이 아이템 왼쪽 끝으로 폴백한다.
 */
function getAvatarRight(anchor: HTMLElement): number | null {
  const avatar = anchor.querySelector<HTMLElement>(
    '[data-menu-align="before"]',
  );
  return avatar ? avatar.getBoundingClientRect().right : null;
}

/**
 * 참여자 아이템을 눌렀을 때 옆에 뜨는 팝오버 메뉴.
 *
 * 사이드바가 좁고 목록이 스크롤되기 때문에 메뉴를 아이템 안에 그리면 잘린다. 그래서
 * position: fixed 로 띄우고 아이템의 화면 좌표를 재서 붙인다. 아래 공간이 모자라면 위로 뒤집는다.
 *
 * 좌표를 한 번만 재고 스크롤 시에는 닫아 버린다. 스크롤을 따라다니게 만들려면 매 프레임
 * 좌표를 다시 재야 하는데, 이 화면은 자세 추론이 메인 스레드를 쓰고 있어 그 비용이 부담이다.
 */
export default function ParticipantMenu({
  anchor,
  participantName,
  isSelf,
  friendStatus,
  friendLoading = false,
  onSelect,
  onClose,
}: ParticipantMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  // 메뉴 크기를 알아야 뒤집을지 정할 수 있어서, 그려진 뒤 화면에 칠하기 전에 좌표를 잡는다.
  // useEffect 로 하면 왼쪽 위에 한 번 나타났다가 제자리로 튀는 게 보인다.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const anchorRect = anchor.getBoundingClientRect();
    const { offsetWidth: menuWidth, offsetHeight: menuHeight } = menu;

    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const flipped =
      spaceBelow < menuHeight + ANCHOR_GAP + VIEWPORT_MARGIN &&
      anchorRect.top > spaceBelow;

    const top = flipped
      ? anchorRect.top - menuHeight - ANCHOR_GAP
      : anchorRect.bottom + ANCHOR_GAP;

    // 왼쪽 끝은 프로필 사진이 끝나는 자리에 맞춘다.
    // 요소를 직접 재므로 사진 크기를 바꿔도 위치가 따라간다.
    const preferredLeft = getAvatarRight(anchor) ?? anchorRect.left;

    // 그래도 창을 벗어나면 안 되므로 마지막에 가둔다.
    const maxLeft = window.innerWidth - menuWidth - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, maxLeft));

    setPosition({
      left,
      top: Math.max(VIEWPORT_MARGIN, top),
      flipped,
    });
  }, [anchor]);

  // 바깥 클릭·Esc·스크롤이면 닫는다.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const menu = menuRef.current;
      if (!menu) return;
      const target = e.target as Node;
      // 기준 아이템을 다시 누른 경우도 여기로 온다. 그때는 아이템 쪽 onClick 이 토글하므로
      // 여기서 닫으면 닫혔다 열리는 왕복이 생긴다. 그래서 아이템 안쪽 클릭은 흘려보낸다.
      if (menu.contains(target) || anchor.contains(target)) return;
      onClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // 스크롤은 목록 안쪽에서도 일어나므로 캡처 단계에서 받는다(스크롤은 버블링하지 않는다).
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  const items: { action: ParticipantMenuAction; label: string }[] = [
    { action: 'profile', label: '프로필 조회' },
  ];

  // 본인에게는 친구·DM 을 붙이지 않는다.
  if (!isSelf) {
    // 관계를 아직 확인하는 중이면 친구 항목만 미뤄 둔다. 모르는 동안 '친구 신청'을
    // 보여 주면 이미 친구인 사람에게 신청 항목이 떴다가 사라진다.
    // 이미 친구면 항목 자체를 숨긴다 — 해제는 프로필 카드에서 한다.
    // OUTGOING 도 넣지 않는다. 취소 엔드포인트가 없고 수락은 상대가 하는 일이라 누를 것이 없다.
    if (!friendLoading) {
      if (friendStatus === 'INCOMING') {
        items.push({ action: 'friend-accept', label: '친구 수락' });
        items.push({ action: 'friend-reject', label: '요청 거절' });
      } else if (friendStatus === 'NONE') {
        items.push({ action: 'friend-request', label: '친구 신청' });
      }
    }
    items.push({ action: 'dm', label: 'DM 전송' });
  }

  return (
    <div
      ref={menuRef}
      className={styles['menu']}
      role="menu"
      aria-label={`${participantName} 메뉴`}
      data-flipped={position?.flipped ? 'true' : undefined}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        // 좌표를 잡기 전 한 프레임 동안 엉뚱한 자리에 보이지 않게 감춰 둔다.
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          onClick={() => onSelect(item.action)}
          className={styles['menu-item']}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
