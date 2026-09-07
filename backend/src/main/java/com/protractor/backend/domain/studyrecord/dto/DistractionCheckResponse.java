package com.protractor.backend.domain.studyrecord.dto;

import com.protractor.backend.domain.studyrecord.entity.Event;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

/**
 * 집중 방해 이벤트(졸음·휴대폰) 저장 응답.
 *
 * <p>
 * 졸음과 휴대폰이 응답을 공유한다. 저장된 뒤에 클라이언트가 알아야 하는 것은 "몇 번 행으로 남았는지"뿐이고, 그 형태가 둘 다 같기
 * 때문이다. 자세({@code PostureCheckResponse})와 달리 status를 두지 않는다 — 이 두 종류는 열린 채로 저장되는 일이
 * 없어서 항상 같은 값이 된다.
 *
 * @param recordedAt 서버가 저장한 시각(events.created_at). 클라이언트가 보낸 감지 시각과는 다르다
 */
@Schema(description = "집중 방해 이벤트 저장 응답")
public record DistractionCheckResponse(Long eventId,
		@Schema(description = "세션 id. study_record_id와 같은 값이다") Long sessionId,
		@Schema(description = "이벤트 종류", example = "DROWSY") String type, LocalDateTime recordedAt) {

	public static DistractionCheckResponse from(Event e) {
		return new DistractionCheckResponse(e.getId(), e.getStudyRecordId(), e.getEventType(), e.getCreatedAt());
	}
}
