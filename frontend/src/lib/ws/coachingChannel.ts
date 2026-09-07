// src/lib/ws/coachingChannel.ts
import type { CoachingState, CoachingStateEvent } from '@/types/room';

/**
 * 코칭 상태(경고·스트레칭) 실시간 전파용 통로.
 *
 * <h3>왜 서버를 거치지 않고 /topic 으로 바로 보내는가</h3>
 * 자세 판정은 각자 브라우저에서만 돌기 때문에, "지금 누가 경고 중인지"는 직접 주고받지 않으면
 * 다른 참여자가 알 수 없다. 그런데 서버에는 이 값을 받아 줄 자리가 없다 — media·messages·timer
 * 는 전부 정해진 DTO 라 필드를 늘리려면 백엔드를 고쳐야 한다.
 *
 * 처음에는 자유 JSON 을 받아 주던 화이트보드 통로({@code /app/study-rooms/{id}/whiteboards})에
 * 얹었는데, develop 의 커밋 066098f "사라진 기능 삭제 및 버그 수정" 이 WhiteboardController 를
 * 지우면서 그 자리가 없어졌다. {@code /app/...} 으로 보낸 메시지는 받아 줄 @MessageMapping 이
 * 없으면 조용히 버려진다 — 오류도 안 나고 아무에게도 안 간다.
 *
 * 그래서 {@code /topic/...} 으로 직접 보낸다. 서버 브로커가 SimpleBroker 라
 * ({@code enableSimpleBroker("/topic", "/queue")}, WebSocketConfig), 클라이언트가 /topic 으로
 * 보낸 메시지도 브로커가 받아 그 목적지 구독자 전원에게 그대로 뿌린다. 백엔드 코드가 필요 없다.
 *
 * <h3>대가 — 보낸 사람을 서버가 보증하지 않는다</h3>
 * 화이트보드 통로는 서버가 인증 정보에서 senderId 를 붙여 줬지만, 브로커를 직접 타면 그 과정이
 * 없다. 그래서 memberId 를 본문에 실어 보내야 하고, <b>마음먹으면 남의 id 로 보낼 수 있다.</b>
 * 할 수 있는 일이 남의 타일에 '경고 상태입니다' 배지를 잘못 띄우는 정도라 그대로 두었다.
 * 서버에 전용 통로(예: /app/study-rooms/{id}/coaching)가 생기면 이 파일만 되돌리면 된다 —
 * 나머지 코드는 통로를 모른다.
 *
 * <h3>남아 있는 한계</h3>
 * 서버가 상태를 보관하지 않으므로 늦게 들어온 사람은 이전 상태를 못 받는다. 그래서 누가
 * 들어올 때마다 각자 자기 상태를 다시 알린다(useRoomSocket). 경고·스트레칭은 몇 초~몇 분짜리
 * 일시적인 상태라 이 정도로 충분하다.
 */

/** 이 통로에 다른 것이 섞여 들어와도 우리 것만 골라내는 표시. */
const COACHING_KIND = 'gak/coaching-state';

/**
 * 보내는 곳. 받는 곳과 같은 주소다 — 서버 핸들러를 거치지 않고 브로커가 곧바로 뿌리기 때문이다.
 * (/app 으로 보내면 받아 줄 핸들러가 없어 그냥 사라진다)
 */
export function coachingDestination(roomId: string | number): string {
  return coachingTopic(roomId);
}

export function coachingTopic(roomId: string | number): string {
  return `/topic/study-rooms/${roomId}/coaching`;
}

/**
 * 보낼 본문.
 *
 * 서버가 보낸 사람을 붙여 주지 않으므로 memberId 를 직접 싣는다. 이 값이 없으면 받는 쪽에서
 * 누구의 상태인지 알 수 없다.
 */
export function coachingBody(memberId: number, state: CoachingState): string {
  return JSON.stringify({ kind: COACHING_KIND, memberId, state });
}

const STATES: readonly CoachingState[] = ['none', 'warning', 'stretching'];

/**
 * 받은 프레임에서 코칭 상태를 꺼낸다. 우리 것이 아니거나 모양이 다르면 null 이다.
 *
 * 아무나 아무 것이나 보낼 수 있는 통로라 모르는 것은 조용히 버린다 — 여기서 예외가 나면
 * STOMP 구독 콜백이 통째로 끊겨 이후 메시지를 못 받는다.
 */
export function parseCoachingFrame(body: string): CoachingStateEvent | null {
  try {
    const frame: unknown = JSON.parse(body);
    if (typeof frame !== 'object' || frame === null) return null;

    const { kind, memberId, state } = frame as {
      kind?: unknown;
      memberId?: unknown;
      state?: unknown;
    };
    if (kind !== COACHING_KIND) return null;
    if (typeof memberId !== 'number') return null;
    if (!STATES.includes(state as CoachingState)) return null;

    return { memberId, state: state as CoachingState };
  } catch {
    return null;
  }
}
