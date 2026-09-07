package com.protractor.backend.domain.studyroom.dto;

import com.protractor.backend.domain.studyroom.entity.StudyRoom;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/**
 * 방 타이머 설정 응답.
 *
 * <p>
 * DB는 초 단위(focus_duration_seconds)로 저장하고, API는 명세대로 분 단위(focusMinutes)로 주고받는다.
 * 남은 시간처럼 매초 바뀌는 값은 여기서 다루지 않는다.
 */
@Schema(description = "방 타이머 설정 응답")
public record TimerResponse(Long roomId, int focusMinutes, int breakMinutes, boolean stretchingEnabled,
		@Schema(description = "변경한 회원 ID (조회 시에는 null)") Long updatedBy, LocalDateTime updatedAt) {

	public static TimerResponse from(StudyRoom room, Long updatedBy) {
		return new TimerResponse(room.getId(), room.getFocusDurationSeconds() / 60, room.getBreakDurationSeconds() / 60,
				room.isStretchingEnabled(), updatedBy, room.getUpdatedAt());
	}
}
