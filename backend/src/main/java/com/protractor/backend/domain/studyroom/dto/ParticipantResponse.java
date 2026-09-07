package com.protractor.backend.domain.studyroom.dto;

import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/** 스터디룸 참여자. 퇴장 시각이 없는 study_record가 현재 참여자다. */
@Schema(description = "스터디룸 참여자")
public record ParticipantResponse(Long studyRecordId, Long memberId,
		@Schema(description = "회원 닉네임", example = "홍길동") String nickname,
		@Schema(description = "프로필 사진 주소. 안 올렸으면 null이다.", example = "/api/v1/public/profile-images/a1b2.jpg") String profileImageUrl,
		LocalDateTime joinedAt, int focusedSeconds) {

	/** 회원을 못 찾았을 때 쓰는 이름. 기록은 있는데 회원이 지워진 경우다. */
	private static final String UNKNOWN_NICKNAME = "알수없음";

	/**
	 * 닉네임과 프로필 사진은 members 테이블에 있어 study_record만으로는 알 수 없다. 호출부에서 회원을
	 * 한 번에 조회해 넘긴다(참여자마다 조회하면 N+1이다).
	 *
	 * @param member
	 *            없을 수 있다 — 탈퇴 등으로 회원이 사라져도 남은 기록은 보여 줘야 한다.
	 */
	public static ParticipantResponse from(StudyRecord r, Member member) {
		return new ParticipantResponse(r.getId(), r.getMemberId(),
				member == null ? UNKNOWN_NICKNAME : member.getNickname(),
				member == null ? null : member.getProfileImageUrl(), r.getJoinedAt(), r.getFocusedSeconds());
	}
}
