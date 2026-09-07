package com.protractor.backend.domain.studyroom.service;

import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;
import com.protractor.backend.domain.studyroom.dto.ParticipantEventResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * 스터디룸 실시간 이벤트 발행기.
 *
 * <p>
 * 입장/퇴장 같은 상태 변화를 {@code /topic/study-rooms/{roomId}/...} 구독자 전원에게 전파한다. REST 처리가
 * 성공(커밋)한 뒤 컨트롤러에서 호출한다. 발행 시점에 닉네임과 현재 인원을 조회해 채운다.
 */
@Component
@RequiredArgsConstructor
public class StudyRoomEventPublisher {

	private final SimpMessagingTemplate messagingTemplate;
	private final MemberRepository memberRepository;
	private final StudyRecordRepository studyRecordRepository;

	/** 입장 알림. */
	public void participantJoined(Long roomId, Long memberId) {
		publishParticipantEvent(roomId, memberId, "JOINED");
	}

	/** 퇴장 알림. */
	public void participantLeft(Long roomId, Long memberId) {
		publishParticipantEvent(roomId, memberId, "LEFT");
	}

	private void publishParticipantEvent(Long roomId, Long memberId, String type) {
		// 프로필 사진을 함께 싣는 이유: 이 이벤트만 받아도 새 참여자를 목록에 그릴 수 있어야 한다.
		// 없으면 누가 들어올 때마다 참여자 목록을 다시 조회해야 한다. 입퇴장은 드물어 부담이 없다.
		Member member = memberRepository.findById(memberId).orElse(null);
		String nickname = member == null ? "알수없음" : member.getNickname();
		String profileImageUrl = member == null ? null : member.getProfileImageUrl();
		int count = (int) studyRecordRepository.countByStudyRoomIdAndLeftAtIsNull(roomId);
		ParticipantEventResponse event = new ParticipantEventResponse(type, roomId, memberId, nickname, profileImageUrl,
				count);
		messagingTemplate.convertAndSend("/topic/study-rooms/" + roomId + "/participants", event);
	}
}
