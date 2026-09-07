// src/stores/speakingStore.ts
import { useCallback, useSyncExternalStore } from 'react';

/**
 * 지금 말하고 있는 사람.
 *
 * 스터디룸 페이지의 상태로 두지 않는 이유가 있다. 말하기 여부는 대화 중 초 단위로 바뀌는데,
 * 그 값이 페이지 상태에 들어가면 바뀔 때마다 화상 그리드와 사이드바까지 전부 다시 그려진다.
 * 같은 화면에서 자세 추론이 메인 스레드를 쓰고 있어 그 비용이 곧바로 끊김으로 보인다.
 *
 * 그래서 페이지 밖에 두고, 본인 타일만 구독하게 한다. 누가 말을 시작해도 그 사람 타일 하나만
 * 다시 그려진다.
 */
const speakingIds = new Set<string>();

/** 참여자별 구독자. 전체가 아니라 해당 참여자의 타일에만 알린다. */
const listeners = new Map<string, Set<() => void>>();

/**
 * 말하기 상태를 바꾼다.
 *
 * 값이 그대로면 아무에게도 알리지 않는다. 감지기는 주기적으로 호출되므로, 이걸 거르지 않으면
 * 말하지 않는 동안에도 계속 리렌더가 돈다.
 */
export function setSpeaking(participantId: string, speaking: boolean): void {
  if (speakingIds.has(participantId) === speaking) return;

  if (speaking) {
    speakingIds.add(participantId);
  } else {
    speakingIds.delete(participantId);
  }
  listeners.get(participantId)?.forEach((notify) => notify());
}

/** 방을 나가거나 세션이 끊길 때 호출한다. 남겨 두면 다음 입장에서 테두리가 켜진 채로 시작한다. */
export function resetSpeaking(): void {
  const wasSpeaking = [...speakingIds];
  speakingIds.clear();
  wasSpeaking.forEach((id) => listeners.get(id)?.forEach((notify) => notify()));
}

/** 이 참여자가 지금 말하고 있는지. 값이 바뀔 때만 해당 컴포넌트가 다시 그려진다. */
export function useIsSpeaking(participantId: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      let group = listeners.get(participantId);
      if (!group) {
        group = new Set();
        listeners.set(participantId, group);
      }
      group.add(notify);

      return () => {
        group.delete(notify);
        if (group.size === 0) listeners.delete(participantId);
      };
    },
    [participantId],
  );

  return useSyncExternalStore(
    subscribe,
    () => speakingIds.has(participantId),
    () => false,
  );
}
