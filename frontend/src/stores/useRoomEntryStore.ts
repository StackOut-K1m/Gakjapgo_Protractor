import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { INITIAL_DETECT_COUNTS } from '@/types/stretching';
import type { TargetPart } from '@/types/stretching';

interface RoomEntryState {
  verifiedRoomId: string | null;
  voiceRoomId: string | null; // 음성 녹음 ON 으로 개설된 방 id
  /**
   * 입장 시 서버가 발급한 studyRecordId(= 세션 id).
   * 자세 판정·진행 시간 동기화·종료가 모두 이 값을 쓴다.
   */
  studyRecordId: number | null;
  /**
   * 입장 시 서버가 발급한 OpenVidu 접속 토큰. 화상 세션 연결(session.connect)에 쓴다.
   * 접속 주소가 토큰 안에 들어 있어 별도 서버 주소 설정이 필요 없다.
   */
  mediaToken: string | null;
  /**
   * 부위별 나쁜 자세 누적 감지 횟수. 한 부위가 임계치에 닿으면 그 부위 스트레칭이 시작된다.
   *
   * 화면 상태가 아니라 여기 있는 이유는 새로고침 때문이다. 화면에 두면 카운터가 0 으로
   * 돌아가서, 새로고침만 하면 스트레칭을 피할 수 있게 된다.
   *
   * 서버에서 다시 읽어 오지는 못한다. 스트레칭을 마치면 그 부위를 0 으로 되돌리는데
   * (StudyRoomPage 의 handleStretchingReturn) 서버에 쌓인 이벤트는 지워지지 않아서,
   * 이벤트 수를 세면 새로고침 직후 스트레칭이 곧바로 다시 뜬다.
   */
  detectCounts: Record<TargetPart, number>;
  /** 이번 세션에서 스트레칭을 마친 횟수. 결과 화면과 종료 요청의 stretchingCount 가 쓴다 */
  stretchingDoneCount: number;
  /**
   * 자동 스트레칭이 지금 몇 번째 차례인가. 스트레칭이 한 번 끝날 때마다 1 오른다.
   *
   * 열려 있는 동안에는 이 값이 바뀌지 않아야 한다 — 뽑힌 동작이 이 값에서 파생되므로,
   * 도중에 오르면 하던 동작이 바뀐다. 그래서 여는 시점이 아니라 닫는 시점에 올린다.
   */
  stretchTurn: number;
  setVerified: (
    roomId: string,
    studyRecordId: number | null,
    mediaToken?: string | null,
  ) => void;
  /**
   * 카운트 갱신. 값이 아니라 갱신 함수만 받는다 — 부르는 쪽이 모두 직전 값에서
   * 1 을 올리거나 특정 부위만 되돌리는 식이라, 값을 통째로 넘기면 그 사이에 들어온
   * 다른 부위의 감지가 지워진다.
   */
  updateDetectCounts: (
    updater: (prev: Record<TargetPart, number>) => Record<TargetPart, number>,
  ) => void;
  /** 스트레칭을 한 번 마쳤다 */
  countStretchingDone: () => void;
  /** 자동 스트레칭을 다음 차례로 넘긴다. 스트레칭을 닫을 때 부른다 */
  advanceStretch: () => void;
  /**
   * 자정을 지나 서버가 기록을 다음 날짜로 넘겼을 때 세션 id 만 갈아끼운다.
   *
   * setVerified 를 쓰지 않는 이유는 mediaToken 때문이다. 그 토큰은 화상 서버 접속에 쓰는
   * 값이라 날짜가 바뀌었다고 새로 받는 것이 아니다. 여기서 같이 덮으면 화상이 끊긴다.
   */
  rollOverStudyRecord: (studyRecordId: number) => void;
  setVoiceRoom: (roomId: string) => void;
  clear: () => void;
}

/**
 * 입장 상태.
 *
 * sessionStorage에 저장한다. 새로고침으로 방에서 튕겨 나가지 않게 하되(같은 탭이라 값이 유지된다),
 * 탭을 닫으면 사라져서 다음에 들어올 때 카메라·자세 확인을 다시 거치게 하려는 것이다.
 * localStorage를 쓰면 며칠 전 입장 기록으로 방에 바로 들어가 버린다.
 */
export const useRoomEntryStore = create<RoomEntryState>()(
  persist(
    (set) => ({
      verifiedRoomId: null,
      voiceRoomId: null,
      studyRecordId: null,
      mediaToken: null,
      detectCounts: INITIAL_DETECT_COUNTS,
      stretchingDoneCount: 0,
      stretchTurn: 0,
      /**
       * 카운트는 세션이 바뀔 때만 지운다.
       *
       * 이 함수는 새로고침 직후에도 불린다 — 화상 토큰은 한 번 쓰면 못 쓰는 값이라
       * 저장하지 않고 입장 API 로 다시 받아 오는데, 그 결과를 여기로 넣기 때문이다
       * (StudyRoomPage 의 '재입장' 효과). 그 길에서 같이 지우면 새로고침마다 카운터가
       * 0 이 되어 애초에 스토어에 둔 이유가 없어진다.
       */
      setVerified: (roomId, studyRecordId, mediaToken = null) =>
        set((s) => ({
          verifiedRoomId: roomId,
          studyRecordId,
          mediaToken,
          ...(studyRecordId === s.studyRecordId
            ? null
            : {
                detectCounts: INITIAL_DETECT_COUNTS,
                stretchingDoneCount: 0,
                stretchTurn: 0,
              }),
        })),
      // 자정을 넘겨 기록 행만 갈리는 경우다. 사람의 자세는 이어지므로 카운트는 두고 간다 —
      // 임계치 직전에 날짜가 바뀌었다고 스트레칭이 밀릴 이유가 없다.
      rollOverStudyRecord: (studyRecordId) => set({ studyRecordId }),
      updateDetectCounts: (updater) =>
        set((s) => ({ detectCounts: updater(s.detectCounts) })),
      countStretchingDone: () =>
        set((s) => ({ stretchingDoneCount: s.stretchingDoneCount + 1 })),
      advanceStretch: () => set((s) => ({ stretchTurn: s.stretchTurn + 1 })),
      setVoiceRoom: (roomId) => set({ voiceRoomId: roomId }),
      clear: () =>
        set({
          verifiedRoomId: null,
          voiceRoomId: null,
          studyRecordId: null,
          mediaToken: null,
          detectCounts: INITIAL_DETECT_COUNTS,
          stretchingDoneCount: 0,
          stretchTurn: 0,
        }),
    }),
    {
      name: 'room-entry',
      storage: createJSONStorage(() => sessionStorage),
      // mediaToken은 한 번 접속하면 못 쓰는 값이라 저장하지 않는다.
      // 새로고침 뒤에는 입장 API를 다시 불러 새 토큰을 받는다.
      partialize: (state) => ({
        verifiedRoomId: state.verifiedRoomId,
        voiceRoomId: state.voiceRoomId,
        studyRecordId: state.studyRecordId,
        detectCounts: state.detectCounts,
        stretchingDoneCount: state.stretchingDoneCount,
      }),
    },
  ),
);
