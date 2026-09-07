package com.protractor.backend.domain.stretching.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.Authentication;

import com.protractor.backend.domain.stretching.dto.StretchingCompleteRequest;
import com.protractor.backend.domain.stretching.dto.StretchingEventResponse;
import com.protractor.backend.domain.stretching.dto.StretchingResponse;
import com.protractor.backend.domain.stretching.dto.StretchingSkipRequest;
import com.protractor.backend.domain.stretching.dto.StretchingStartRequest;
import com.protractor.backend.domain.stretching.service.StretchingService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@Tag(name = "Stretching", description = "스트레칭 API")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class StretchingController {

	private final StretchingService stretchingService;

	@GetMapping("/stretchings")
	@Operation(summary = "스트레칭 가이드 목록 조회", description = "활성화된 스트레칭 가이드를 정렬 순서대로 조회한다.")
	public List<StretchingResponse> getList() {
		return stretchingService.getList();
	}

	@PostMapping("/study-records/{studyRecordId}/stretchings/{stretchingId}/start")
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "스트레칭 시작", description = "스터디 세션 중 특정 스트레칭을 시작한 이벤트를 저장한다.")
	public StretchingEventResponse start(
			@Parameter(description = "스터디 기록 ID", example = "4") @PathVariable("studyRecordId") Long studyRecordId,
			@Parameter(description = "스트레칭 ID", example = "1") @PathVariable("stretchingId") Long stretchingId,
			Authentication authentication, @RequestBody(required = false) StretchingStartRequest request) {
		return stretchingService.start(currentMemberId(authentication), studyRecordId, stretchingId, request);
	}

	@PatchMapping("/stretching-events/{eventId}")
	@Operation(summary = "스트레칭 완료", description = "시작된 스트레칭 이벤트의 완료율과 종료 시각을 저장한다.")
	public StretchingEventResponse complete(
			@Parameter(description = "스트레칭 이벤트 ID", example = "10") @PathVariable("eventId") Long eventId,
			Authentication authentication, @Valid @RequestBody StretchingCompleteRequest request) {
		return stretchingService.complete(currentMemberId(authentication), eventId, request);
	}

	@PostMapping("/study-records/{studyRecordId}/stretchings/{stretchingId}/skip")
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "스트레칭 건너뛰기", description = "스터디 세션 중 특정 스트레칭을 건너뛴 이벤트를 저장한다.")
	public StretchingEventResponse skip(
			@Parameter(description = "스터디 기록 ID", example = "4") @PathVariable("studyRecordId") Long studyRecordId,
			@Parameter(description = "스트레칭 ID", example = "1") @PathVariable("stretchingId") Long stretchingId,
			Authentication authentication, @Valid @RequestBody(required = false) StretchingSkipRequest request) {
		return stretchingService.skip(currentMemberId(authentication), studyRecordId, stretchingId, request);
	}

	private Long currentMemberId(Authentication authentication) {
		return (Long) authentication.getPrincipal();
	}
}
