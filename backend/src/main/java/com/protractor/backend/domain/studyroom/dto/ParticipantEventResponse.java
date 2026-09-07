package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 참여자 상태 변화 브로드캐스트. 입장/퇴장이 일어나면 서버가
 * {@code /topic/study-rooms/{roomId}/participants} 구독자 전원에게 보낸다.
 *
 * <p>
 * 클라가 직접 보내는 게 아니라, REST join/leave가 성공(트랜잭션 커밋)한 뒤 서버가 자동으로 발행한다.
 */
@Schema(description = "참여자 상태 변화(입장/퇴장) 브로드캐스트")
public record ParticipantEventResponse(
		@Schema(description = "변화 유형", example = "JOINED", allowableValues = { "JOINED", "LEFT" }) String type,
		@Schema(description = "스터디룸 ID", example = "1") Long roomId,
		@Schema(description = "대상 회원 ID", example = "17") Long memberId,
		@Schema(description = "대상 회원 닉네임", example = "홍길동") String nickname,
		@Schema(description = "프로필 사진 주소. 안 올렸으면 null이다.", example = "/api/v1/public/profile-images/a1b2.jpg") String profileImageUrl,
		@Schema(description = "현재 참여 인원(퇴장 안 한 사람 수)", example = "3") int participantsCount) {
}
