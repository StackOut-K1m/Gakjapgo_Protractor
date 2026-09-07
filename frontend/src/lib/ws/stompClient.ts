// src/lib/ws/stompClient.ts
// STOMP 클라이언트 생성. 백엔드 WebSocketConfig 의 규칙을 그대로 따른다.
//   - 접속 주소: /ws (SockJS 아님, 순수 WebSocket)
//   - 구독: /topic/...  전송: /app/...
//   - 인증: CONNECT 프레임의 Authorization: Bearer <accessToken>
import { Client } from '@stomp/stompjs';

/**
 * WebSocket 주소.
 *
 * 기본은 현재 접속한 호스트의 /ws 로, dev 서버(vite proxy)와 배포(nginx) 모두 같은 경로를 쓴다.
 * 프록시를 거치지 않고 백엔드에 직접 붙어야 하면 VITE_WS_URL 로 덮어쓴다.
 */
function resolveWsUrl(): string {
  const override = import.meta.env.VITE_WS_URL;
  if (override) return override;
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/ws`;
}

interface StompClientOptions {
  /** 연결(재연결 포함)될 때마다 호출된다. 구독은 여기서 건다. */
  onConnect: (client: Client) => void;
  /**
   * 서버가 ERROR 프레임을 보냈을 때. 대부분 토큰 만료·무효라 호출부에서 토큰을 갱신한다.
   * 갱신되면 새 토큰으로 클라이언트를 다시 만들어 붙는다.
   */
  onAuthError?: () => void;
}

/**
 * 연결 준비가 된 STOMP 클라이언트를 만든다. activate() 는 호출부에서 한다.
 *
 * 끊기면 5초 뒤 자동 재접속한다. 재접속 시 구독은 사라지므로 onConnect 에서 다시 구독해야 한다.
 */
export function createStompClient(
  accessToken: string,
  options: StompClientOptions,
): Client {
  const client = new Client({
    brokerURL: resolveWsUrl(),
    // CONNECT 프레임에 실려 서버 ChannelInterceptor 가 검증한다.
    connectHeaders: { Authorization: `Bearer ${accessToken}` },
    reconnectDelay: 5000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
  });

  client.onConnect = () => options.onConnect(client);

  // 서버가 인증 실패 등으로 ERROR 프레임을 보낼 때. 조용히 끊기면 원인을 알 수 없어 로그를 남긴다.
  client.onStompError = (frame) => {
    console.error('[STOMP] error:', frame.headers['message'], frame.body);
    options.onAuthError?.();
  };

  return client;
}
