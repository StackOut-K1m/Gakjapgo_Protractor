import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 친구 독의 화면 상태.
 *
 * <b>서버에서 받은 목록은 여기 두지 않는다.</b> 관계의 원천은 서버이고, 계약이 "변경 성공 뒤
 * 재조회"를 요구한다. 전역에 캐싱하면 화면마다 낡은 목록을 들고 있게 되고, 목업 시절
 * (useFriendStore)과 같은 문제로 돌아간다. 여기에는 접힘 여부처럼 서버가 모르는 값만 둔다.
 *
 * localStorage 에 남기는 이유는 새로고침·페이지 이동 뒤에도 사용자가 열어 둔 상태를
 * 유지하려는 것이다. 접었는데 다음 화면에서 다시 펼쳐지면 매번 접어야 한다.
 */
/** 친구 찾기 창의 탭. null 이면 창이 닫혀 있다 */
export type FinderTab = 'search' | 'requests';

interface FriendDockState {
  /** 접혀 있으면 원형 버튼만 보인다. 처음 방문은 접힘으로 시작한다. */
  collapsed: boolean;
  /**
   * 지금 열려 있는 DM 방. null 이면 열린 창이 없다.
   *
   * 동시에 하나만 여는 이유는 플로팅 창이 여러 개면 화면을 그만큼 가리기 때문이다.
   * 다른 사람과의 DM 을 열면 이 값이 교체된다.
   */
  openDmRoomId: number | null;
  /**
   * 열려 있는 DM 방의 상대 회원. 친구를 삭제할 때 <b>그 사람과의 창인지</b> 판단하는 데 쓴다.
   *
   * 저장하지 않는다(아래 partialize). 알림에서 방 번호만 받아 여는 경로가 있어 처음에는
   * null 일 수 있고, 그때는 창이 상대를 알아낸 뒤 채워 준다.
   */
  openDmMemberId: number | null;
  /** DM 창을 최소화했는지. 최소화 중에는 메시지를 조회하지 않는다(읽음 처리가 딸려 온다). */
  dmMinimized: boolean;
  /**
   * 친구 찾기 창이 열려 있는 탭. 닫혀 있으면 null.
   *
   * 패널 안의 지역 상태가 아니라 여기 두는 이유는 <b>알림에서도 이 창을 열기</b> 때문이다.
   * 친구 신청 알림을 누르면 독을 펼치고 '받은 요청' 탭을 열어야 한다.
   */
  finderTab: FinderTab | null;

  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  /** DM 창 열기. 최소화 상태는 항상 풀어 준다 — 열라고 눌렀는데 접힌 채면 안 된다. */
  openDm: (roomId: number, memberId?: number | null) => void;
  closeDm: () => void;
  /** 창이 상대를 알아냈을 때 채워 준다(알림으로 방 번호만 받아 연 경우) */
  setOpenDmMemberId: (memberId: number) => void;
  setDmMinimized: (minimized: boolean) => void;
  /** 친구 찾기 창 열기. 독이 접혀 있으면 함께 펼친다 — 창만 떠 있으면 뒤가 비어 보인다. */
  openFinder: (tab: FinderTab) => void;
  setFinderTab: (tab: FinderTab) => void;
  closeFinder: () => void;
}

export const useFriendDockStore = create<FriendDockState>()(
  persist(
    (set) => ({
      collapsed: true,
      openDmRoomId: null,
      openDmMemberId: null,
      dmMinimized: false,
      finderTab: null,

      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),

      openDm: (roomId, memberId = null) =>
        set({
          openDmRoomId: roomId,
          openDmMemberId: memberId,
          dmMinimized: false,
        }),
      closeDm: () =>
        set({ openDmRoomId: null, openDmMemberId: null, dmMinimized: false }),
      setOpenDmMemberId: (openDmMemberId) => set({ openDmMemberId }),
      setDmMinimized: (dmMinimized) => set({ dmMinimized }),

      openFinder: (tab) => set({ finderTab: tab, collapsed: false }),
      setFinderTab: (tab) => set({ finderTab: tab }),
      closeFinder: () => set({ finderTab: null }),
    }),
    {
      name: 'friend-dock',
      // 상대 회원 id 는 저장하지 않는다 — 새로고침 뒤에는 창이 스스로 다시 알아낸다.
      partialize: (state) => ({
        collapsed: state.collapsed,
        openDmRoomId: state.openDmRoomId,
        dmMinimized: state.dmMinimized,
      }),
    },
  ),
);
