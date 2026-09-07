package com.protractor.backend.domain.studyroom.controller;

import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.domain.studyroom.dto.ChatMessageRequest;
import com.protractor.backend.domain.studyroom.dto.ChatMessageResponse;
import com.protractor.backend.domain.studyroom.service.ChatHistoryService;
import java.security.Principal;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import jakarta.validation.Valid;

/**
 * 스터디룸 실시간 채팅.
 *
 * <p>
 * 흐름: 클라가 {@code /app/study-rooms/{roomId}/messages}로 보내면 → 서버가 보낸 사람(인증된 memberId)과
 * 닉네임을 붙여 → {@code /topic/study-rooms/{roomId}/messages} 구독자 전원에게 전파한다.
 *
 * <p>
 * 전파와 함께 {@link ChatHistoryService}에 방별 최근 50건을 남긴다. 새로고침·재접속한 사람은
 * {@code GET /api/v1/study-rooms/{roomId}/messages}로 그 이력을 받아 간다. 보관처는 DB가 아니라 서버
 * 메모리라, 서버가 재시작되면 이력은 사라지고 방이 닫히면 함께 버려진다.
 */
@Controller
@RequiredArgsConstructor
public class ChatController {

	private final SimpMessagingTemplate messagingTemplate;
	private final MemberRepository memberRepository;
	private final ChatHistoryService chatHistoryService;

	@MessageMapping("/study-rooms/{roomId}/messages")
	public void send(@DestinationVariable Long roomId, @Valid @Payload ChatMessageRequest request, Principal principal) {
		// principal은 CONNECT 때 인증된 회원. 보낸 사람은 요청이 아니라 여기서 정한다(위조 방지).
		Long senderId = Long.parseLong(principal.getName());
		String nickname = memberRepository.findById(senderId).map(m -> m.getNickname()).orElse("알수없음");

		ChatMessageResponse response = ChatMessageResponse.of(roomId, senderId, nickname, request.content());

		// 새로고침·재접속한 사람이 놓친 대화를 받아 갈 수 있게 보관한 뒤 전파한다.
		chatHistoryService.add(roomId, response);
		// 목적지가 roomId에 따라 달라지므로 @SendTo 대신 템플릿으로 직접 전송한다.
		messagingTemplate.convertAndSend("/topic/study-rooms/" + roomId + "/messages", response);
	}
}
