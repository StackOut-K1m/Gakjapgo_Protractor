package com.protractor.backend.domain.studyroom.dto;

import com.protractor.backend.domain.studyroom.entity.StudyRoom;

/** 홈 추천 카드 전용 응답이다. 추천 사유는 UI가 설명을 추가할 때 사용할 수 있다. */
public record RecommendedStudyRoomResponse(Long roomId, String title, Long studyTagId, int currentMembers,
        int maxMembers, String thumbnailImageUrl, String recommendationReason) {

    public static RecommendedStudyRoomResponse from(StudyRoom room, int currentMembers, boolean tagMatched) {
        return new RecommendedStudyRoomResponse(room.getId(), room.getTitle(), room.getStudyTagId(), currentMembers,
                room.getMaxMembers(), room.getThumbnailImageUrl(), tagMatched ? "INTEREST_TAG" : "ACTIVE_ROOM");
    }
}
