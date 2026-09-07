package com.protractor.backend.domain.studyroom.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 미디어 상태 전파 메시지. {@code /topic/study-rooms/{roomId}/media} 구독자 전원에게 간다.
 *
 * <p>
 * 누가 카메라·마이크를 껐는지, 누가 화면을 공유 중인지 참여자 타일에 표시하는 데 쓴다. 늦게 들어온 사람은 이 이벤트만으로는 기존
 * 참여자 상태를 알 수 없어, 입장 직후 스냅샷(REST)을 한 번 받는다.
 */
@Schema(description = "미디어 상태 전파 메시지")
public record MediaStateResponse(
		@Schema(description = "회원 ID", example = "17") Long memberId,

		@Schema(description = "회원 닉네임", example = "홍길동") String nickname,

		@Schema(description = "카메라 켜짐 여부", example = "true") boolean cameraOn,

		@Schema(description = "마이크 켜짐 여부", example = "true") boolean micOn,

		@Schema(description = "화면 공유 중 여부", example = "false") boolean screenSharing) {

	public static MediaStateResponse of(Long memberId, String nickname, MediaStateRequest request) {
		return new MediaStateResponse(memberId, nickname, Boolean.TRUE.equals(request.cameraOn()),
				Boolean.TRUE.equals(request.micOn()), Boolean.TRUE.equals(request.screenSharing()));
	}
}
