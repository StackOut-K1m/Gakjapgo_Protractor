// src/hooks/useSessionUnloadFlush.ts
//
// 창이 닫히는 순간, 진행 중이던 감지 구간(졸음·휴대폰)을 마지막으로 한 번 저장한다.
//
// 왜 이것만 남았는가
//   졸음·휴대폰도 이제 확정될 때마다 서버에 저장된다(drowsiness-checks / phone-checks).
//   그래서 여기서 챌 것은 "아직 끝나지 않아 못 보낸 구간" 하나씩뿐이다. 졸다가, 또는 폰을
//   보다가 탭을 닫으면 그 구간은 열린 채라 아무도 안 보냈다.
//
// 왜 fetch keepalive 인가
//   문서가 사라지는 중에는 axios(XHR) 요청이 취소될 수 있다. useStudyProgressSync 가
//   progress 를 같은 방식으로 보내고 있어 그 패턴을 따른다. 훅이 직접 보내지 않고 이벤트만
//   받아 오는 이유가 이것이다(takePending).
//
// 왜 중복 걱정이 없는가
//   훅의 closeEpisode 가 진행 중 구간을 먼저 비우고 값을 돌려준다. "나가기" 경로가 이미
//   flushNow() 로 닫았다면 여기서는 null 이 와서 아무것도 보내지 않는다. 반대도 같다.
//
// 왜 종료(end)를 부르지 않는가
//   그건 서버의 미응답 종료 처리(endByDisconnect)에 맡긴다. 이벤트만 저장해 두면 서버가
//   나중에 그것까지 집계해 점수를 계산한다. 여기서 end 를 앞질러 부르면 종료 사유만 바꿔
//   놓는 셈이고, 창이 닫히는 중이라 성공 여부도 확인할 수 없다.
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import { API_BASE_URL } from '@/api/client';
import { useAuthStore } from '@/stores/useAuthStore';
import type { DrowsinessEvent, PhoneUseEvent } from '@/types/studyRecord';

interface Options {
  /** 세션 id. 없으면 아무것도 하지 않는다 */
  studyRecordId: number | null;
  /** 진행 중인 졸음 구간을 닫아 돌려준다 (useDrowsinessDetection.takePending) */
  takePendingDrowsiness: () => DrowsinessEvent | null;
  /** 진행 중인 휴대폰 사용 구간을 닫아 돌려준다 (usePhoneDetection.takePending) */
  takePendingPhone: () => PhoneUseEvent | null;
  /** "나가기" 로 이미 종료를 시도했으면 true — 그때는 보내지 않는다 */
  ended: RefObject<boolean>;
}

export function useSessionUnloadFlush({
  studyRecordId,
  takePendingDrowsiness,
  takePendingPhone,
  ended,
}: Options): void {
  // 콜백은 렌더마다 새로 만들어질 수 있어 ref 로 잡는다.
  const takeRef = useRef({ takePendingDrowsiness, takePendingPhone });
  useEffect(() => {
    takeRef.current = { takePendingDrowsiness, takePendingPhone };
  }, [takePendingDrowsiness, takePendingPhone]);

  useEffect(() => {
    if (studyRecordId === null) return;

    const handlePageHide = () => {
      if (ended.current) return;

      const token = useAuthStore.getState().accessToken;
      if (!token) return;

      /** 문서가 사라지는 중이라 결과를 확인할 수 없다. 실패하면 그 한 건은 사라진다. */
      const send = (path: string, body: DrowsinessEvent | PhoneUseEvent) => {
        fetch(`${API_BASE_URL}/study-sessions/${studyRecordId}/${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(() => {});
      };

      const drowsiness = takeRef.current.takePendingDrowsiness();
      if (drowsiness !== null) send('drowsiness-checks', drowsiness);

      const phone = takeRef.current.takePendingPhone();
      if (phone !== null) send('phone-checks', phone);
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [studyRecordId, ended]);
}
