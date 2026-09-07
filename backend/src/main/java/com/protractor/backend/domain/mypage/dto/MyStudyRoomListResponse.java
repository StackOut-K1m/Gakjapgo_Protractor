package com.protractor.backend.domain.mypage.dto;

import java.util.List;
import org.springframework.data.domain.Page;

/** 최근 스터디 목록 응답. 스터디룸 목록(StudyRoomListResponse)과 같은 페이지 형태를 쓴다. */
public record MyStudyRoomListResponse(
        List<MyStudyRoomResponse> studyRooms,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
    public static MyStudyRoomListResponse of(Page<?> pageResult, List<MyStudyRoomResponse> items) {
        return new MyStudyRoomListResponse(items, pageResult.getNumber(), pageResult.getSize(),
                pageResult.getTotalElements(), pageResult.getTotalPages());
    }
}
