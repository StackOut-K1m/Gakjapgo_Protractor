package com.protractor.backend.global.config;

import com.protractor.backend.global.websocket.StompAuthChannelInterceptor;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * 스터디룸 실시간(WebSocket + STOMP) 설정.
 *
 * <p>
 * 클라이언트는 먼저 {@code /ws}로 연결한 뒤, 목적지(destination) 규칙으로 메시지를 주고받는다.
 * <ul>
 * <li>구독(서버→클라 받기): {@code /topic/...} — 예) /topic/study-rooms/1/messages</li>
 * <li>전송(클라→서버 보내기): {@code /app/...} — 예) /app/study-rooms/1/messages</li>
 * </ul>
 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

	/**
	 * 하트비트 주기(ms).
	 *
	 * <p>
	 * 서버가 연결이 죽은 것을 언제 알아채는지를 정한다. 이 값이 없으면 <b>탭을 급히 닫았을 때 서버가 끊김을 아예 모른다</b> —
	 * 브라우저가 종료 신호(close 프레임)를 못 보내고 사라지면, TCP가 시간이 다 되어 끊길 때까지 서버는 그 사람이 방에 있다고
	 * 믿는다. 실제로 운영에서 32분 뒤에야 퇴장 처리된 기록이 있었다.
	 *
	 * <p>
	 * 새로고침이나 탭 닫기는 브라우저가 대개 연결을 정상적으로 닫아 주므로 이 값과 무관하게 곧바로 감지된다. 하트비트가 잡는 것은
	 * <b>닫는 신호가 아예 오지 않는 경우</b>다 — 와이파이 끊김, 절전 모드 진입, 프로세스 강제 종료.
	 *
	 * <p>
	 * 10초는 감지 속도와 트래픽의 절충이다. 방 하나당 사람 수만큼 10초마다 몇 바이트가 오갈 뿐이라 부담은 없고, 늦어도
	 * 20초 안에는 끊김을 알아챈다. 방 정리까지는 여기에 유예 20초와 청소 주기가 더 붙는다.
	 */
	private static final long HEARTBEAT_MILLIS = 10_000L;

	// CORS 허용 origin. REST(SecurityConfig)와 같은 값을 쓴다.
	@Value("${app.cors.allowed-origins}")
	private List<String> allowedOrigins;

	// CONNECT 시 JWT를 검증하는 인터셉터.
	private final StompAuthChannelInterceptor stompAuthChannelInterceptor;

	/** 클라이언트가 최초로 연결하는 주소. ws://localhost:8080/ws */
	@Override
	public void registerStompEndpoints(StompEndpointRegistry registry) {
		registry.addEndpoint("/ws").setAllowedOrigins(allowedOrigins.toArray(String[]::new));
	}

	/** 메시지 라우팅 규칙. */
	@Override
	public void configureMessageBroker(MessageBrokerRegistry registry) {
		// 서버 -> 클라 브로드캐스트 통로. 클라가 /topic/... 을 구독하면 받는다.
		// (지금은 인메모리 브로커. 다중 서버로 확장하면 Redis 등 외부 브로커로 교체한다.)
		// /topic 은 방 전체 브로드캐스트, /queue 는 특정 접속 하나에게만 보내는 용도다.
		// (예: 같은 계정이 새 탭으로 들어왔을 때 기존 탭에만 종료를 알린다)
		registry.enableSimpleBroker("/topic", "/queue")
				// [서버가 보내는 주기, 서버가 클라이언트에게 기대하는 주기] (ms)
				.setHeartbeatValue(new long[] { HEARTBEAT_MILLIS, HEARTBEAT_MILLIS })
				// 이 스케줄러가 없으면 위 설정이 조용히 무시된다. 넣고도 안 도는 흔한 함정이다.
				.setTaskScheduler(webSocketHeartbeatScheduler());
		// 클라 -> 서버 전송 접두사. /app/... 로 보내면 @MessageMapping 핸들러가 받는다.
		registry.setApplicationDestinationPrefixes("/app");
	}

	/** 클라이언트가 보내는 모든 STOMP 메시지가 지나가는 채널. 여기에 인증 인터셉터를 건다. */
	@Override
	public void configureClientInboundChannel(ChannelRegistration registration) {
		registration.interceptors(stompAuthChannelInterceptor);
	}

	/**
	 * 하트비트 전용 스케줄러.
	 *
	 * <p>
	 * 주기적으로 신호를 보내고 상대의 신호를 확인하는 일을 맡는다. 하는 일이 가볍고 짧아 스레드 하나면 충분하다.
	 */
	@Bean
	public TaskScheduler webSocketHeartbeatScheduler() {
		ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
		scheduler.setPoolSize(1);
		scheduler.setThreadNamePrefix("ws-heartbeat-");
		scheduler.initialize();
		return scheduler;
	}
}
