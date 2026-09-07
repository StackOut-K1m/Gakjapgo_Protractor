package com.protractor.backend.domain.posture.dto;

import com.protractor.backend.domain.posture.entity.PostureCheckStatus;
import com.protractor.backend.domain.studyrecord.entity.Event;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/**
 * 자세 체크 결과 저장 응답.
 *
 * <p>
 * 저장 요청과 필드 이름이 다른 자리가 셋 있어 매핑을 적어 둔다.
 *
 * <ul>
 * <li>{@code type} — 요청의 eventType(POSTURE)
 * <li>{@code status} — 요청에 없는 값이라 endedAt 유무로 정한다. 비어 있으면 아직 진행 중(DETECTED),
 * 채워져 있으면 해소됨(RESOLVED)
 * <li>{@code reason} — 요청의 detail. 어떤 자세 때문에 기록됐는지가 곧 사유다
 * </ul>
 *
 * @param recordedAt 서버가 저장한 시각(events.created_at). 클라이언트가 보낸 startedAt과는 다르다
 */
@Schema(description = "자세 체크 결과 저장 응답")
public record PostureCheckResponse(Long eventId,
		@Schema(description = "세션 id. study_record_id와 같은 값이다") Long sessionId, String type,
		PostureCheckStatus status, String reason, LocalDateTime recordedAt) {

	public static PostureCheckResponse from(Event e) {
		PostureCheckStatus status = e.getEndedAt() == null ? PostureCheckStatus.DETECTED : PostureCheckStatus.RESOLVED;
		return new PostureCheckResponse(e.getId(), e.getStudyRecordId(), e.getEventType(), status, e.getDetail(),
				e.getCreatedAt());
	}
}
