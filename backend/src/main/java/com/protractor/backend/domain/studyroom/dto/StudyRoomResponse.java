package com.protractor.backend.domain.studyroom.dto;

import com.protractor.backend.domain.studyroom.entity.StudyRoom;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/** 스터디룸 상세 응답. */
@Schema(description = "스터디룸 상세 응답")
public record StudyRoomResponse(Long roomId, Long hostMemberId, String title, String status, String roomType,
		int maxMembers, int currentMembers, Integer plannedDurationSeconds, int focusDurationSeconds,
		int breakDurationSeconds, boolean stretchingEnabled, Long studyTagId, String hashTags, boolean isLocked,
		String rules, String description, String thumbnailImageUrl, LocalDateTime startedAt, LocalDateTime endedAt,
		LocalDateTime expiresAt, String endReason, LocalDateTime createdAt, LocalDateTime updatedAt) {

	// 주의: password는 민감 정보라 응답에 포함하지 않는다.
	public static StudyRoomResponse from(StudyRoom r, int currentMembers) {
		return new StudyRoomResponse(r.getId(), r.getHostMemberId(), r.getTitle(), r.getStatus().name(),
				r.getRoomType(), r.getMaxMembers(), currentMembers, r.getPlannedDurationSeconds(),
				r.getFocusDurationSeconds(), r.getBreakDurationSeconds(), r.isStretchingEnabled(), r.getStudyTagId(),
				r.getHashTags(), r.isLocked(), r.getRules(), r.getDescription(), r.getThumbnailImageUrl(),
				r.getStartedAt(), r.getEndedAt(), r.getExpiresAt(), r.getEndReason(), r.getCreatedAt(),
				r.getUpdatedAt());
	}
}
