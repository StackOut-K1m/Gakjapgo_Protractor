package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 채팅 전송 요청. 클라이언트가 {@code /app/study-rooms/{roomId}/messages}로 보낸다.
 *
 * <p>
 * 보낸 사람(memberId)은 요청에 담지 않는다. WebSocket 연결 시 인증된 값을 서버가 Principal에서 꺼내 쓴다(위조 방지).
 */
@Schema(description = "채팅 전송 요청")
public record ChatMessageRequest(
		@Schema(description = "메시지 내용", example = "안녕하세요") @NotBlank @Size(max = 1000) String content) {
}
