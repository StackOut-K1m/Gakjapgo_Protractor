package com.protractor.backend.domain.schedule.controller;

import com.protractor.backend.domain.member.dto.MessageResponse;
import com.protractor.backend.domain.schedule.dto.ScheduleCreateRequest;
import com.protractor.backend.domain.schedule.dto.ScheduleListResponse;
import com.protractor.backend.domain.schedule.dto.ScheduleResponse;
import com.protractor.backend.domain.schedule.dto.ScheduleUpdateRequest;
import com.protractor.backend.domain.schedule.service.ScheduleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Schedule", description = "일정(캘린더) API")
@RestController
@RequestMapping("/api/v1/schedules")
@RequiredArgsConstructor
public class ScheduleController {

    private final ScheduleService scheduleService;

    @Operation(summary = "일정 목록 조회 (월 단위, year/month 생략 시 이번 달)")
    @GetMapping
    public ResponseEntity<ScheduleListResponse> getMonthly(
            Authentication authentication,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) Integer month
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(scheduleService.getMonthly(memberId, year, month));
    }

    @Operation(summary = "다가오는 D-day 일정",
            description = "D-day 를 켠 일정 중 오늘 이후 것을 가까운 순으로. 홈 화면 상단 카드가 쓴다.")
    @GetMapping("/upcoming")
    public ResponseEntity<List<ScheduleResponse>> getUpcoming(
            Authentication authentication,
            @RequestParam(required = false) Integer limit
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(scheduleService.getUpcoming(memberId, limit));
    }

    @Operation(summary = "일정 등록")
    @PostMapping
    public ResponseEntity<ScheduleResponse> create(
            Authentication authentication,
            @Valid @RequestBody ScheduleCreateRequest request
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        ScheduleResponse response = scheduleService.create(memberId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(summary = "일정 수정 (보낸 필드만 반영)")
    @PatchMapping("/{scheduleId}")
    public ResponseEntity<ScheduleResponse> update(
            Authentication authentication,
            @PathVariable Long scheduleId,
            @Valid @RequestBody ScheduleUpdateRequest request
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(scheduleService.update(memberId, scheduleId, request));
    }

    @Operation(summary = "일정 삭제")
    @DeleteMapping("/{scheduleId}")
    public ResponseEntity<MessageResponse> delete(
            Authentication authentication,
            @PathVariable Long scheduleId
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        scheduleService.delete(memberId, scheduleId);
        return ResponseEntity.ok(new MessageResponse("일정이 삭제되었습니다."));
    }
}
