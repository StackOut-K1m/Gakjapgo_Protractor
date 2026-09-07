// src/components/friend/FriendDock.tsx
import { useLocation } from 'react-router-dom';

import { useIncomingRequestCount } from '@/hooks/useIncomingRequestCount';
import { useFriendDockStore } from '@/stores/useFriendDockStore';
import { useIsLoggedIn } from '@/stores/useAuthStore';
import DmWindow from './DmWindow';
import FriendDockToggle from './FriendDockToggle';
import FriendListPanel from './FriendListPanel';

/**
 * 이 경로에서는 독을 숨긴다.
 *
 * 온보딩은 회원가입 직후 감지 동의를 받는 강제 흐름이라, 그 위에 친구 목록이 떠 있으면
 * 지금 해야 할 일이 무엇인지 흐려진다. OAuth 콜백은 코드를 교환하는 동안 잠깐 지나가는
 * 화면이라 띄울 이유가 없다.
 */
const HIDDEN_PATH_PREFIXES = ['/onboarding', '/oauth/callback'];

/**
 * 전역 친구 독.
 *
 * <b>RootLayout 에 마운트된다</b> — 라우트가 바뀌어도 언마운트되지 않아야 펼침 상태와
 * DM 창, 받아 둔 목록이 그대로 유지된다. 페이지마다 렌더하면 이동할 때마다 다시 마운트되어
 * 창이 닫히고 목록을 매번 다시 받는다.
 *
 * 스터디룸은 다른 라우트 트리(별도 팝업 창)라 여기 마운트되지 않는다 — 그 화면에는
 * 참여자·채팅 사이드바가 이미 있고, 코칭·스트레칭 화면과 겹친다.
 *
 * 받은 신청 건수를 여기서 받는 이유는 접힘·펼침 두 상태가 같은 값을 써야 하기 때문이다
 * (접혔을 때는 원형 버튼 배지, 펼쳤을 때는 친구 찾기 버튼 배지).
 */
export default function FriendDock() {
  const isLoggedIn = useIsLoggedIn();
  const { pathname } = useLocation();
  const collapsed = useFriendDockStore((s) => s.collapsed);
  const setCollapsed = useFriendDockStore((s) => s.setCollapsed);
  const openDmRoomId = useFriendDockStore((s) => s.openDmRoomId);
  const dmMinimized = useFriendDockStore((s) => s.dmMinimized);
  const setDmMinimized = useFriendDockStore((s) => s.setDmMinimized);
  const closeDm = useFriendDockStore((s) => s.closeDm);
  const setOpenDmMemberId = useFriendDockStore((s) => s.setOpenDmMemberId);

  const hidden =
    !isLoggedIn ||
    HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  // 훅은 조건 없이 부른다. 숨겨진 경로에서는 요청만 건너뛴다.
  const requests = useIncomingRequestCount(!hidden);

  if (hidden) return null;

  return (
    <>
      {/* 접혀 있을 때만 원형 버튼을 둔다. 펼친 뒤 접는 일은 패널 헤더가 맡는다 */}
      {collapsed && (
        <FriendDockToggle
          onOpen={() => setCollapsed(false)}
          requestCount={requests.count}
        />
      )}

      {/*
       * 패널은 접어도 요소를 남기고 화면 밖으로 밀어낸다. 지웠다 다시 만들면 목록을 매번
       * 새로 받고 스크롤 위치도 잃는다(스터디룸 사이드바와 같은 방식).
       */}
      <FriendListPanel
        open={!collapsed}
        onCollapse={() => setCollapsed(true)}
        requestCount={requests.count}
        onRequestsChanged={requests.refresh}
      />

      {/*
       * DM 창도 여기에 둔다. 패널 안에 두면 패널을 접을 때 대화가 함께 사라지고,
       * 접힌 패널의 transform 때문에 창 위치도 어긋난다(FriendListPanel 참고).
       */}
      {openDmRoomId !== null && (
        <DmWindow
          roomId={openDmRoomId}
          minimized={dmMinimized}
          panelOpen={!collapsed}
          onMinimize={() => setDmMinimized(true)}
          onRestore={() => setDmMinimized(false)}
          onClose={closeDm}
          onPeerResolved={setOpenDmMemberId}
        />
      )}
    </>
  );
}
