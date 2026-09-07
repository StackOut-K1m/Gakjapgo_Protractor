package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 채팅 브로드캐스트 응답. 서버가 {@code /topic/study-rooms/{roomId}/messages} 구독자 전원에게 보낸다.
 *
 * <p>
 * DB에 저장하지 않는 실시간 전파 방식이라, messageId는 클라이언트 구분용 UUID를 서버가 발급한다. 입장 이후 오는 메시지만
 * 받으며 이전 대화 이력은 제공하지 않는다.
 */
@Schema(description = "채팅 브로드캐스트 메시지")
public record ChatMessageResponse(String messageId, Long roomId, Long senderId, String senderNickname, String content,
		LocalDateTime sentAt) {

	public static ChatMessageResponse of(Long roomId, Long senderId, String senderNickname, String content) {
		return new ChatMessageResponse(UUID.randomUUID().toString(), roomId, senderId, senderNickname, content,
				LocalDateTime.now());
	}
}
