package com.protractor.backend.domain.studyroom.dto;

import com.protractor.backend.domain.studyroom.entity.StudyRoom;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;

/**
 * 스터디룸 목록 응답. 명세의 {@code { studyRooms[], page }} 형태를 따른다.
 *
 * <p>
 * 프론트가 페이지 이동·전체 개수를 표시할 수 있도록 페이지 정보를 함께 담는다.
 */
@Schema(description = "스터디룸 목록 응답")
public record StudyRoomListResponse(List<StudyRoomSummary> studyRooms, int page, int size, long totalElements,
		int totalPages) {

	/** memberCounts는 roomId→현재 참여자 수. 없는 방은 0으로 채운다. */
	public static StudyRoomListResponse from(Page<StudyRoom> pageResult, Map<Long, Integer> memberCounts) {
		List<StudyRoomSummary> items = pageResult.getContent().stream()
				.map(room -> StudyRoomSummary.from(room, memberCounts.getOrDefault(room.getId(), 0))).toList();
		return new StudyRoomListResponse(items, pageResult.getNumber(), pageResult.getSize(),
				pageResult.getTotalElements(), pageResult.getTotalPages());
	}
}
