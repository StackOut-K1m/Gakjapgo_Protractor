package com.protractor.backend.domain.studyroom.controller;

import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.domain.studyroom.dto.MediaStateRequest;
import com.protractor.backend.domain.studyroom.dto.MediaStateResponse;
import com.protractor.backend.domain.studyroom.service.MediaStateService;
import jakarta.validation.Valid;
import java.security.Principal;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * 미디어 상태(카메라·마이크·화면공유) 실시간 공유.
 *
 * <p>
 * 영상 자체는 OpenVidu가 나르고, 여기서는 "누가 껐는지"만 주고받는다. 실제 송출은 각자 브라우저가 멈추므로 이 값은 화면
 * 표시용이다. 상태가 바뀔 때만 보내면 되므로 트래픽이 거의 없다.
 */
@Controller
@RequiredArgsConstructor
public class MediaStateController {

	private final SimpMessagingTemplate messagingTemplate;
	private final MemberRepository memberRepository;
	private final MediaStateService mediaStateService;

	@MessageMapping("/study-rooms/{roomId}/media")
	public void update(@DestinationVariable Long roomId, @Valid @Payload MediaStateRequest request,
			Principal principal) {
		// 보낸 사람은 요청 값이 아니라 인증 정보에서 정한다(다른 사람 상태를 위조하지 못하게).
		Long memberId = Long.parseLong(principal.getName());
		String nickname = memberRepository.findById(memberId).map(m -> m.getNickname()).orElse("알수없음");

		MediaStateResponse response = MediaStateResponse.of(memberId, nickname, request);
		// 늦게 들어온 사람이 받아 갈 수 있게 보관한 뒤 전파한다.
		mediaStateService.update(roomId, response);
		messagingTemplate.convertAndSend("/topic/study-rooms/" + roomId + "/media", response);
	}
}
