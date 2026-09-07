package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/** 스터디룸 나가기 응답. leftAt은 서버 시각으로 기록한다. */
@Schema(description = "스터디룸 나가기 응답")
public record LeaveRoomResponse(Long roomId, Long memberId, LocalDateTime leftAt) {
}
