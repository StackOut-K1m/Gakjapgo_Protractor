package com.protractor.backend.domain.studyroom.dto;

import com.protractor.backend.domain.studyroom.entity.StudyRoom;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/** 스터디룸 목록 아이템. 목록에 필요한 필드만 담아 응답 크기를 줄인다. */
@Schema(description = "스터디룸 목록 아이템")
public record StudyRoomSummary(Long roomId, String title, String status, String roomType, int maxMembers,
		int currentMembers, boolean stretchingEnabled, Long studyTagId, String hashTags, boolean isLocked,
		String thumbnailImageUrl, LocalDateTime createdAt) {

	/** 현재 참여자 수(currentMembers)는 study_records 카운트라 컬럼이 아니므로 밖에서 주입받는다. */
	public static StudyRoomSummary from(StudyRoom r, int currentMembers) {
		return new StudyRoomSummary(r.getId(), r.getTitle(), r.getStatus().name(), r.getRoomType(), r.getMaxMembers(),
				currentMembers, r.isStretchingEnabled(), r.getStudyTagId(), r.getHashTags(), r.isLocked(),
				r.getThumbnailImageUrl(), r.getCreatedAt());
	}
}
