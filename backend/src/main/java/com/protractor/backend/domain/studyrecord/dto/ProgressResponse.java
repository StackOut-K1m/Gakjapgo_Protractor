package com.protractor.backend.domain.studyrecord.dto;

import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/** 세션 진행 동기화 응답. 저장된 누적값을 돌려주어 반영 여부를 확인할 수 있게 한다. */
@Schema(description = "세션 진행 동기화 응답")
public record ProgressResponse(Long studyRecordId, int totalStudySeconds, int focusedSeconds, int breakSeconds,
		int awaySeconds, LocalDateTime syncedAt) {

	public static ProgressResponse from(StudyRecord r) {
		return new ProgressResponse(r.getId(), r.getTotalStudySeconds(), r.getFocusedSeconds(), r.getBreakSeconds(),
				r.getAwaySeconds(), r.getUpdatedAt());
	}
}
