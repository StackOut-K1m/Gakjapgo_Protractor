import { Outlet, ScrollRestoration } from 'react-router-dom';

import FriendDock from '@/components/friend/FriendDock';
import { useUserSocket } from '@/hooks/useUserSocket';
import { useAuthStore } from '@/stores/useAuthStore';
import Footer from './Footer';
import GlobalHeader from './GlobalHeader';

function RootLayout() {
  const member = useAuthStore((s) => s.member);

  /*
   * 개인 채널(DM·알림·친구) 연결. 라우트가 바뀌어도 끊기지 않아야 해서 여기서 붙인다.
   * 서버 브로드캐스트가 아직 없어 지금은 구독만 해 두고 조용히 대기한다.
   */
  useUserSocket();

  return (
    <div className="app-layout">
      {/*
       * 페이지를 옮기면 맨 위에서 시작하게 한다.
       *
       * 라우터는 주소만 바꾸고 스크롤은 건드리지 않는다. 그래서 홈 아래쪽의 "방 만들기"처럼
       * 화면을 내린 상태에서 누르면 다음 화면도 그만큼 내려간 채로 그려졌다.
       *
       * 직접 window.scrollTo 를 부르지 않고 이 컴포넌트를 쓰는 이유는 뒤로 가기 때문이다.
       * 뒤로 가기는 보던 자리로 돌아가야 하는데, 매번 위로 올리면 목록을 한참 내려서 들어갔다
       * 나온 사람이 다시 처음부터 내려야 한다. ScrollRestoration 은 새로 이동할 때만 위로
       * 올리고 뒤로/앞으로 갈 때는 그때 그 자리를 복원한다.
       */}
      <ScrollRestoration />
      <GlobalHeader userName={member?.nickname ?? ''} />
      <main className="app-main">
        <Outlet />
      </main>
      <Footer />

      {/*
       * 친구 독. 여기 두는 이유는 라우트가 바뀌어도 이 컴포넌트가 언마운트되지 않기 때문이다 —
       * 페이지를 옮겨도 펼침 상태와 DM 창, 받아 둔 목록이 그대로 유지된다.
       * 로그인 여부·숨길 경로 판단은 FriendDock 안에서 한다.
       */}
      <FriendDock />
    </div>
  );
}

export default RootLayout;
