package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 스터디룸 입장 응답.
 *
 * <p>
 * studyRecordId는 이후 progress/end·감지 이벤트에서 쓰는 세션 식별자이고, mediaToken은 프론트가
 * OpenVidu에 접속할 때 사용한다.
 */
@Schema(description = "스터디룸 입장 응답")
public record JoinRoomResponse(Long roomId, Long memberId,
		@Schema(description = "스터디 기록 ID = 세션 ID. 감지 이벤트·progress·end가 이 값을 사용", example = "1") Long studyRecordId,
		@Schema(description = "OpenVidu 세션 식별자", example = "study-room-1") String openviduSessionId,
		@Schema(description = "OpenVidu 접속 토큰(프론트가 이걸로 화상 연결). 화상 서버에 연결하지 못하면 null이며, 이때도 입장 자체는 성공이다") String mediaToken) {
}
