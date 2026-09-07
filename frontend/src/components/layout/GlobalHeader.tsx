// src/components/layout/GlobalHeader.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';

import { logout } from '@/api/authApi';
import { useAuthStore, useIsLoggedIn } from '@/stores/useAuthStore';
import logoImg from '@/assets/logo.png';
import NotificationBell from './NotificationBell';
import styles from './GlobalHeader.module.css';

interface GlobalHeaderProps {
  userName?: string;
}

interface NavItem {
  label: string;
  /**
   * 이 항목 자체를 눌렀을 때 갈 주소.
   *
   * children 과 같이 있으면 "누르면 이동하고, 마우스를 올리면 하위 메뉴가 펼쳐지는" 항목이 된다.
   */
  to?: string;
  /**
   * 하위 메뉴가 있는 항목의 활성 판단용 접두사. 갈래가 여럿이면 배열로 준다.
   *
   * '/' 는 여기 넣을 수 없다 — 모든 경로가 걸린다. 홈은 아래에서 따로 처리한다.
   */
  prefix?: string | string[];
  children?: { label: string; to: string }[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: '스터디',
    to: '/',
    // 스터디 방 찾기·만들기는 라우터에 있는데 헤더 어디에도 없었다. 스터디 화면을 거쳐야만
    // 닿을 수 있어서 여기에 건다.
    prefix: '/study',
    children: [
      { label: '스터디 방 찾기', to: '/study' },
      { label: '스터디 만들기', to: '/study/create' },
    ],
  },
  {
    // 하위 메뉴 없이 주간 리포트로 바로 간다.
    // 접두사를 /mypage 전체가 아니라 /mypage/report 로 좁혔다 — 캘린더가 독립 메뉴가
    // 되면서, 캘린더 화면에서 리포트까지 같이 켜져 보이면 안 된다.
    label: '리포트',
    to: '/mypage/report/weekly',
    prefix: '/mypage/report',
  },
  {
    // 캘린더는 리포트의 하위가 아니라 제 몫의 메뉴다(사용자 피드백 — 리포트 밑에
    // 캘린더 하나만 매달린 드롭다운은 소속도 어색하고 헛걸음만 만들었다).
    label: '캘린더',
    to: '/mypage/calendar',
  },
  {
    // 누르면 전체 게시판으로 바로 간다. 그래서 하위에 '전체게시글'을 따로 두지 않는다 —
    // 같은 주소로 가는 항목이 둘이면 뭐가 다른지 찾게 된다. 위 '리포트'(주간 리포트)와
    // 같은 방식이다.
    //
    // 나머지 하위 순서는 게시판 화면의 탭 순서와 같게 둔다. 두 곳에서 순서가 다르면
    // 같은 목록을 두 번 익혀야 한다.
    label: '커뮤니티',
    to: '/community',
    prefix: '/community',
    children: [
      { label: '공지사항', to: '/community/notice' },
      { label: '자유게시판', to: '/community/free' },
      { label: '질문하기', to: '/community/questions' },
      { label: '자료공유', to: '/community/resources' },
      { label: '이벤트', to: '/community/events' },
    ],
  },
  {
    // 하위 메뉴 없이 1:1 문의로 바로 간다. FAQ 항목이 하위에 있었는데 그 화면이 아직
    // 없어서 눌러 봐야 갈 곳이 없었다 — 화면이 생기면 그때 다시 단다.
    // '관리자 전용'도 뺐다. 라우트(support/admin)도 같이 지웠으므로 되살리려면 둘 다 필요하다.
    label: '문의하기',
    to: '/support',
    prefix: '/support',
  },
];

/**
 * 마우스가 메뉴를 벗어난 뒤 실제로 닫기까지의 유예(ms).
 *
 * 유예 없이 mouseleave 즉시 닫으면, 트리거에서 하위 항목으로 대각선으로 내려가는 흔한
 * 손놀림에도 경로가 래퍼를 잠깐 벗어나는 순간 메뉴가 사라진다(사용자 피드백: "가혹하게
 * 닫힌다"). 이 시간 안에 다시 들어오면 아무 일도 없던 것이 된다.
 * 너무 길면 다른 메뉴로 옮겼는데 이전 패널이 한참 남아 있는 것처럼 보인다.
 */
const CLOSE_GRACE_MS = 250;

interface NavDropdownProps {
  item: NavItem;
  isOpen: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onClose: () => void;
}

function NavDropdown({
  item,
  isOpen,
  onOpen,
  onToggle,
  onClose,
}: NavDropdownProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  /** 예약된 닫기. 마우스가 유예 안에 돌아오면 취소한다 */
  const closeTimer = useRef<number | null>(null);

  const cancelScheduledClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  /** 마우스 이탈용 — 유예를 두고 닫는다. 키보드·클릭 닫기는 그대로 즉시다 */
  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      onClose();
    }, CLOSE_GRACE_MS);
  }, [cancelScheduledClose, onClose]);

  /** 즉시 닫기 — 예약이 남아 있으면 지워서 이중으로 닫지 않는다 */
  const closeNow = useCallback(() => {
    cancelScheduledClose();
    onClose();
  }, [cancelScheduledClose, onClose]);

  // 화면을 떠날 때 예약이 남아 있으면 사라진 메뉴를 닫으려 든다.
  useEffect(() => cancelScheduledClose, [cancelScheduledClose]);

  /**
   * 클릭으로도 여닫을 수 있는 항목인가.
   *
   * 하위 메뉴는 어느 항목이든 마우스를 올리면 펼쳐진다. 다만 이 항목 자체가 링크이면
   * 클릭은 이동에 써야 하므로, 클릭 토글은 링크가 없는 항목만 갖는다.
   * 마우스가 없는 환경(터치·키보드)에서 하위 메뉴를 여는 유일한 수단이기도 하다.
   */
  const togglesOnClick = item.to === undefined;

  // 바깥 클릭 감시는 클릭으로 여는 메뉴에만 필요하다.
  // 마우스로 연 경우는 영역을 벗어나는 순간 닫히므로 감시할 것이 없다.
  useEffect(() => {
    if (!isOpen || !togglesOnClick) return;
    function onClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        closeNow();
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOpen, togglesOnClick, closeNow]);

  if (!item.children) {
    return (
      <NavLink
        to={item.to ?? '/'}
        end={item.to === '/'}
        className={({ isActive }) =>
          isActive
            ? `${styles['nav-link']} ${styles['is-active']}`
            : styles['nav-link']
        }
      >
        {item.label}
      </NavLink>
    );
  }

  // 홈은 '/' 라서 접두사로 판단할 수 없다(모든 경로가 걸린다). 정확히 일치할 때만 활성으로 본다.
  const prefixes = item.prefix === undefined ? [] : [item.prefix].flat();
  const isActive =
    (item.to === '/' && pathname === '/') ||
    prefixes.some((prefix) => pathname.startsWith(prefix));

  /**
   * 포커스가 이 메뉴 밖으로 나갈 때만 닫는다.
   *
   * 하위 항목 사이를 탭으로 옮기는 동안에는 열어 둬야 키보드로도 고를 수 있다.
   * React 의 onBlur 는 focusout 이라 자식에서 올라온다.
   */
  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeNow();
  }

  return (
    // 하위 메뉴가 있는 항목은 모두 마우스를 올리면 펼쳐진다.
    // 포커스에도 반응해야 탭으로 넘어가는 사람도 하위 항목에 닿을 수 있다.
    // 마우스 이탈은 즉시 닫지 않고 유예를 둔다(CLOSE_GRACE_MS) — 다시 들어오면 취소된다.
    <div
      ref={wrapperRef}
      className={styles['nav-dropdown-wrapper']}
      onMouseEnter={() => {
        cancelScheduledClose();
        onOpen();
      }}
      onMouseLeave={scheduleClose}
      onFocus={onOpen}
      onBlur={handleBlur}
    >
      {item.to ? (
        // 이동이 본래 동작이라 링크로 둔다. 펼침 상태는 위 래퍼가 마우스·포커스로 관리한다.
        <NavLink
          to={item.to}
          onClick={closeNow}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className={styles['nav-dropdown-trigger']}
          data-open={isOpen}
          data-active={isActive}
        >
          {item.label}
        </NavLink>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className={styles['nav-dropdown-trigger']}
          data-open={isOpen}
          data-active={isActive}
        >
          {item.label}
        </button>
      )}

      {isOpen && (
        <div className={styles['nav-dropdown-panel']}>
          {item.children.map((child) => (
            <Link
              key={child.to}
              to={child.to}
              onClick={closeNow}
              className={styles['nav-dropdown-item']}
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GlobalHeader({ userName = '' }: GlobalHeaderProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navigate = useNavigate();
  const isLoggedIn = useIsLoggedIn();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  // 마이페이지에서 사진을 바꾸면 이 값도 같이 갱신된다(ProfileSection 참고)
  const myProfileImage = useAuthStore((s) => s.member?.profileImageUrl);

  function toggleMenu(label: string) {
    setOpenMenu((prev) => (prev === label ? null : label));
  }

  async function handleLogout() {
    setOpenMenu(null);
    try {
      await logout(); // 서버의 refreshToken 무효화
    } catch {
      // 서버 로그아웃이 실패해도 클라이언트 세션은 반드시 정리한다.
    }
    clearAuth();
    navigate('/');
  }

  return (
    <header className={styles['site-header']}>
      <div className={styles['header-inner']}>
        <Link
          to="/"
          className={styles['header-logo']}
          onClick={() => setOpenMenu(null)}
        >
          <img src={logoImg} alt="" className={styles['logo-img']} />
          <span className={styles['logo-wordmark']}>각잡고</span>
        </Link>

        <nav className={styles['main-nav']}>
          {NAV_ITEMS.map((item) => (
            <NavDropdown
              key={item.label}
              item={item}
              isOpen={openMenu === item.label}
              onOpen={() => setOpenMenu(item.label)}
              onToggle={() => toggleMenu(item.label)}
              // 자기 메뉴가 열려 있을 때만 닫는다. 무조건 null 로 밀면, A 메뉴의
              // 유예 닫기(CLOSE_GRACE_MS)가 그 사이 B 로 옮겨 연 메뉴까지 닫아 버린다.
              onClose={() =>
                setOpenMenu((prev) => (prev === item.label ? null : prev))
              }
            />
          ))}
        </nav>

        <div className={styles['header-actions']}>
          {/* 알림 종. 로그인 상태에서만 보이고, 그 판단은 컴포넌트 안에서 한다 */}
          <NotificationBell />

          {isLoggedIn ? (
            <>
              <button
                type="button"
                onClick={handleLogout}
                className={styles['logout-btn']}
              >
                로그아웃
              </button>
              {userName && (
                <button
                  type="button"
                  // 상단 메뉴에서 '내 프로필'을 뺐으므로 마이페이지로 가는 길은 여기뿐이다
                  title="내 프로필"
                  onClick={() => navigate('/mypage')}
                  className={styles['user-avatar']}
                >
                  {/* 사진을 안 올렸으면 닉네임 앞 두 글자로 대신한다 */}
                  {myProfileImage ? (
                    <img src={myProfileImage} alt="" />
                  ) : (
                    userName.slice(0, 2)
                  )}
                </button>
              )}
            </>
          ) : (
            <>
              <NavLink to="/login" className={styles['login-link']}>
                로그인
              </NavLink>
              <NavLink to="/signup" className={styles['signup-link']}>
                회원가입
              </NavLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
