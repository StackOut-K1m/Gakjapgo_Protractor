// src/components/study/SettingsMenu.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import styles from './SettingsMenu.module.css';

export interface SettingsMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  /**
   * 지금 고른 항목인지. 값을 넘긴 메뉴는 라디오 묶음처럼 동작한다(배경 효과 등).
   *
   * 넘기지 않으면 예전처럼 그냥 실행 항목이다 — 타이머 시작·정지처럼 "고른 상태"라는 게
   * 없는 항목에 체크 표시가 붙으면 켜고 끄는 스위치로 오해하게 된다.
   */
  selected?: boolean;
}

interface SettingsMenuProps {
  /** 메뉴를 띄울 기준이 되는 버튼 */
  anchor: HTMLElement;
  items: SettingsMenuItem[];
  onClose: () => void;
}

/** 메뉴와 기준 버튼 사이 간격(px) */
const ANCHOR_GAP = 8;
/** 창 가장자리에서 이만큼은 띄운다(px) */
const VIEWPORT_MARGIN = 8;

/**
 * 컨트롤바 설정 버튼에서 올라오는 메뉴.
 *
 * 컨트롤바가 화면 맨 아래라 메뉴는 위로 펼친다. position: fixed 로 띄우고 버튼의 화면
 * 좌표를 재서 붙인다 — 컨트롤바 안에 그리면 바깥으로 넘칠 수 없어 잘린다.
 */
export default function SettingsMenu({
  anchor,
  items,
  onClose,
}: SettingsMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  // 메뉴 높이를 알아야 위로 얼마나 올릴지 정할 수 있어서, 화면에 칠하기 전에 좌표를 잡는다.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = anchor.getBoundingClientRect();
    const { offsetWidth: menuWidth, offsetHeight: menuHeight } = menu;

    // 오른쪽 끝에 있는 버튼이라 오른쪽을 맞추고, 창 밖으로 나가지 않게 가둔다.
    const maxLeft = window.innerWidth - menuWidth - VIEWPORT_MARGIN;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.right - menuWidth, maxLeft),
    );

    setPosition({
      left,
      top: Math.max(VIEWPORT_MARGIN, rect.top - menuHeight - ANCHOR_GAP),
    });
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const menu = menuRef.current;
      if (!menu) return;
      const target = e.target as Node;
      // 기준 버튼을 다시 누르면 버튼 쪽 onClick 이 토글한다. 여기서 닫으면 왕복이 생긴다.
      if (menu.contains(target) || anchor.contains(target)) return;
      onClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onClose);

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={menuRef}
      className={styles['menu']}
      role="menu"
      aria-label="설정 메뉴"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        // 좌표를 잡기 전 한 프레임 동안 엉뚱한 자리에 보이지 않게 감춰 둔다.
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          // selected 를 넘긴 항목은 여럿 중 하나를 고르는 묶음이다. 화면 낭독기에도
          // 그렇게 알려야 "지금 무엇이 골라져 있는지"를 들을 수 있다.
          role={item.selected === undefined ? 'menuitem' : 'menuitemradio'}
          aria-checked={item.selected}
          type="button"
          onClick={item.onSelect}
          className={styles['menu-item']}
          data-selected={item.selected || undefined}
        >
          {item.label}
          {item.selected && (
            <span className={styles['menu-check']} aria-hidden>
              ✓
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
