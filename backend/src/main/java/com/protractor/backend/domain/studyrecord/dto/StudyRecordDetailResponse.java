package com.protractor.backend.domain.studyrecord.dto;

import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 세션 상세 응답. 명세의 "스터디 세션 상세 조회" 응답 필드를 따른다(studyRecordId = 명세의 sessionId).
 *
 * 종료 전 세션을 조회하면 점수 항목은 null이고 시간은 마지막 동기화 값이 반환된다.
 */
@Schema(description = "세션(스터디 기록) 상세 응답")
public record StudyRecordDetailResponse(Long studyRecordId, Long roomId, Long memberId, LocalDateTime joinedAt,
		LocalDateTime leftAt, String endReason, int totalStudySeconds, int focusedSeconds, int breakSeconds,
		int awaySeconds, int badPostureSeconds, BigDecimal goodPostureRatio, int warningCount,
		int stretchingAttemptCount, int stretchingCompletedCount) {

	public static StudyRecordDetailResponse from(StudyRecord r) {
		return new StudyRecordDetailResponse(r.getId(), r.getStudyRoomId(), r.getMemberId(), r.getJoinedAt(),
				r.getLeftAt(), r.getEndReason(), r.getTotalStudySeconds(), r.getFocusedSeconds(), r.getBreakSeconds(),
				r.getAwaySeconds(), r.getBadPostureSeconds(), r.getGoodPostureRatio(), r.getWarningCount(),
				r.getStretchingAttemptCount(), r.getStretchingCompletedCount());
	}
}
