package com.protractor.backend.domain.mypage.controller;

import com.protractor.backend.domain.mypage.dto.MyPageSummaryResponse;
import com.protractor.backend.domain.mypage.dto.MyStudyRoomListResponse;
import com.protractor.backend.domain.mypage.service.MyPageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "MyPage", description = "마이페이지 API")
@RestController
@RequestMapping("/api/v1/mypage")
@RequiredArgsConstructor
public class MyPageController {

    private final MyPageService myPageService;

    @Operation(summary = "마이페이지 요약 조회 (프로필/참여 중인 스터디/평균 출석률/총 학습 시간)")
    @GetMapping("/summary")
    public ResponseEntity<MyPageSummaryResponse> getSummary(Authentication authentication) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(myPageService.getSummary(memberId));
    }

    @Operation(summary = "내 최근 스터디 목록 조회 (최근 참여 순)")
    @GetMapping("/study-rooms")
    public ResponseEntity<MyStudyRoomListResponse> getMyStudyRooms(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(myPageService.getMyStudyRooms(memberId, page, size));
    }
}
