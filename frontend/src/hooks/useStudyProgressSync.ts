// src/hooks/useStudyProgressSync.ts
import { useEffect, useRef } from 'react';

import { API_BASE_URL } from '@/api/client';
import { syncStudyProgress } from '@/api/studyRecordApi';
import { useAuthStore } from '@/stores/useAuthStore';

/** 자동 저장 주기. 짧을수록 유실이 줄지만 요청이 늘어난다. */
const SYNC_INTERVAL_MS = 30_000;

interface Options {
  /** 세션 id. 없으면 아무것도 하지 않는다 */
  studyRecordId: number | null;
  /** 이 방의 누적 순공 시간(초) — 재입장이면 기존 값을 더한 값이어야 한다 */
  focusedSeconds: number;
  /** 이 방의 누적 휴식 시간(초) — 스트레칭·쉬는 시간처럼 순공이 멈춘 구간 */
  breakSeconds: number;
  /** 이 방의 누적 자리비움 시간(초) — 자리비움·졸음·휴대폰으로 순공에서 뺀 시간 */
  awaySeconds: number;
  /**
   * 자정을 넘겨 서버가 기록을 다음 날짜로 넘겼을 때 부른다.
   *
   * 학습 기록은 "방 × 회원 × 학습일" 단위라, 자정을 지나면 서버가 어제 행을 마감하고 새 행을
   * 만든다. 그 시점부터 세션 id 가 바뀌므로 화면도 갈아타야 한다 — 옛 id 로 계속 보내면
   * 이미 마감된 기록이라 409 가 되고, 그때부터 공부 시간도 자세 판정도 저장되지 않는다.
   */
  onRolledOver?: (
    nextStudyRecordId: number,
    carriedFocusedSeconds: number,
  ) => void;
}

/**
 * 공부 시간을 주기적으로 서버에 남긴다.
 *
 * 종료할 때 한 번만 보내면 창을 닫거나 브라우저가 죽었을 때 그 세션이 통째로 사라진다.
 * 나가기 버튼을 누르는 경우가 오히려 드물어서, 일정 주기로 누적값을 저장해 둔다.
 * progress 는 받은 값으로 덮어쓰는 API 라 여러 번 보내도 시간이 부풀지 않는다.
 *
 * 창이 닫히는 순간에도 한 번 더 보내 마지막 구간까지 남긴다.
 *
 * 누적값은 호출부가 이미 합쳐서 넘긴다(재입장 분 포함). 서버는 total 을
 * focused + break + away 로 계산하므로, away 를 빼먹으면 집중도 점수가 항상 100 이 된다.
 */
export function useStudyProgressSync({
  studyRecordId,
  focusedSeconds,
  breakSeconds,
  awaySeconds,
  onRolledOver,
}: Options) {
  // 초마다 저장 타이머를 다시 걸지 않으려고 누적값은 ref 로 읽는다.
  const timesRef = useRef({ focusedSeconds, breakSeconds, awaySeconds });
  useEffect(() => {
    timesRef.current = { focusedSeconds, breakSeconds, awaySeconds };
  }, [focusedSeconds, breakSeconds, awaySeconds]);

  // 콜백이 렌더마다 새로 만들어져도 타이머를 다시 걸지 않도록 ref 로 잡는다.
  const onRolledOverRef = useRef(onRolledOver);
  useEffect(() => {
    onRolledOverRef.current = onRolledOver;
  }, [onRolledOver]);

  useEffect(() => {
    if (studyRecordId === null) return;

    const buildBody = () => ({
      focusedSeconds: timesRef.current.focusedSeconds,
      // 스트레칭·쉬는 시간도 보낸다.
      //
      // 예전에는 0 으로 두었다. 그런데 그 구간에는 순공(focused)도 자리비움(away)도 멈추므로,
      // 여기서도 빼면 그 시간이 어디에도 남지 않고 사라진다. 서버는 나쁜 자세 시간을 자기 시계로
      // 재기 때문에, 사라진 시간만큼 두 숫자의 기준이 어긋난다 — 33분으로 기록된 세션에서 나쁜
      // 자세가 44분으로 잡혀 자세 유지율이 0% 가 된 적이 있다.
      breakSeconds: timesRef.current.breakSeconds,
      awaySeconds: timesRef.current.awaySeconds,
    });

    const timer = setInterval(() => {
      syncStudyProgress(studyRecordId, buildBody())
        .then((saved) => {
          // 응답의 id 가 보낸 id 와 다르면 자정을 지나 서버가 기록을 나눈 것이다.
          if (saved.studyRecordId !== studyRecordId) {
            onRolledOverRef.current?.(
              saved.studyRecordId,
              saved.focusedSeconds,
            );
          }
        })
        .catch(() => {
          // 실패해도 다음 주기에 다시 보낸다. 공부는 계속돼야 한다.
        });
    }, SYNC_INTERVAL_MS);

    // 페이지가 사라지는 중에는 일반 요청이 취소될 수 있어 keepalive 로 보낸다.
    const handlePageHide = () => {
      const token = useAuthStore.getState().accessToken;
      if (!token) return;
      fetch(`${API_BASE_URL}/study-records/${studyRecordId}/progress`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildBody()),
        keepalive: true,
      }).catch(() => {
        // 창이 닫히는 중이라 결과를 확인할 수 없다. 실패해도 주기 저장분은 남아 있다.
      });
    };
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [studyRecordId]);
}
