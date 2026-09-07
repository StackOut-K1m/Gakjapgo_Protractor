package com.protractor.backend.global.websocket;

import com.protractor.backend.global.security.JwtTokenProvider;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * WebSocket(STOMP) 연결 인증.
 *
 * <p>
 * 클라이언트가 CONNECT할 때 보낸 {@code Authorization: Bearer <accessToken>} 헤더를 검증하고, 통과하면 이후
 * 그 연결의 모든 메시지에서 회원(memberId)을 Principal로 꺼내 쓸 수 있게 세션에 심는다. REST의
 * JwtAuthenticationFilter와 같은 검증 로직을 STOMP 연결 시점에 적용하는 것이다.
 */
@Component
@RequiredArgsConstructor
public class StompAuthChannelInterceptor implements ChannelInterceptor {

	private static final String AUTHORIZATION_HEADER = "Authorization";
	private static final String BEARER_PREFIX = "Bearer ";

	private final JwtTokenProvider jwtTokenProvider;

	@Override
	public Message<?> preSend(Message<?> message, MessageChannel channel) {
		StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

		// 최초 연결(CONNECT)에서만 토큰을 검사한다. 이후 SEND/SUBSCRIBE는 이미 인증된 연결을 재사용한다.
		if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
			String token = resolveToken(accessor.getFirstNativeHeader(AUTHORIZATION_HEADER));

			if (token == null || !jwtTokenProvider.validateToken(token) || !jwtTokenProvider.isAccessToken(token)) {
				// 여기서 예외를 던지면 STOMP가 ERROR 프레임을 보내고 연결을 끊는다.
				throw new MessagingException("WebSocket 인증 실패: 유효한 accessToken이 필요합니다.");
			}

			Long memberId = jwtTokenProvider.getMemberId(token);
			String role = jwtTokenProvider.getRole(token);
			UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(memberId, null,
					List.of(new SimpleGrantedAuthority("ROLE_" + role)));

			// 이후 @MessageMapping 메서드에서 Principal로 주입받아 principal.getName() == memberId 로 쓴다.
			accessor.setUser(authentication);
		}

		return message;
	}

	private String resolveToken(String bearerToken) {
		if (StringUtils.hasText(bearerToken) && bearerToken.startsWith(BEARER_PREFIX)) {
			return bearerToken.substring(BEARER_PREFIX.length());
		}
		return null;
	}
}
