package com.protractor.backend.global.websocket;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

/**
 * STOMP 연결 확인용 임시 핸들러.
 *
 * <p>
 * 클라가 {@code /app/ping}으로 보내면 {@code /topic/pong}을 구독한 모든 클라에게 되돌려준다. STOMP 기본 설정이
 * 동작하는지 확인하려고 만든 것으로, 프론트는 이 경로를 쓰지 않는다.
 *
 * <p>
 * <b>보낸 사람이 누구인지는 응답에 넣지 않는다.</b> {@code /topic/pong}은 방별 경로가 아니라서 로그인한 사람이면
 * 누구나 구독할 수 있고, 그 자리에 memberId를 실으면 ping 한 번에 구독자 전원이 그 값을 보게 된다. 연결이
 * 살아 있는지만 알면 되는 핸들러라 보낸 값을 그대로 돌려주는 것으로 충분하다.
 */
@Controller
public class WebSocketPingController {

	@MessageMapping("/ping")
	@SendTo("/topic/pong")
	public String ping(String message) {
		return "pong: " + message;
	}
}
