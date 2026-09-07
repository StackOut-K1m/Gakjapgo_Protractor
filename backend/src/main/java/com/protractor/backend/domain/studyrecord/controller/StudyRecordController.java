package com.protractor.backend.domain.studyrecord.controller;

import com.protractor.backend.domain.studyrecord.dto.EndRequest;
import com.protractor.backend.domain.studyrecord.dto.EndResponse;
import com.protractor.backend.domain.studyrecord.dto.ProgressRequest;
import com.protractor.backend.domain.studyrecord.dto.ProgressResponse;
import com.protractor.backend.domain.studyrecord.dto.StudyRecordDetailResponse;
import com.protractor.backend.domain.studyrecord.dto.StudySummaryResponse;
import com.protractor.backend.domain.studyrecord.service.StudyRecordService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "StudyRecord", description = "스터디 기록 API")
@RestController
@RequestMapping("/api/v1/study-records")
@RequiredArgsConstructor
public class StudyRecordController {

	private final StudyRecordService studyRecordService;

	@Operation(summary = "홈 화면 학습 요약 조회", description = "오늘·이번 주(월~일)·지난주의 집중 시간과 연속 학습일수를 함께 조회한다. "
			+ "기간을 자르는 기준은 입장 시각(joined_at)이 아니라 학습일(study_date)이다 — 자정을 넘겨 공부하면 "
			+ "진행 중이던 기록이 어제 몫으로 마감되고 오늘 몫이 새로 생긴다. "
			+ "진행 중인 세션도 포함한다(30초마다 갱신되므로 최신에 가깝다). "
			+ "연속 학습일수는 오늘 아직 공부하지 않았으면 어제까지로 센다.")
	@GetMapping("/me/summary")
	public StudySummaryResponse summary(Authentication authentication) {
		return studyRecordService.getSummary(currentMemberId(authentication));
	}

	@Operation(summary = "스터디 기록 상세 조회", description = "입장 시각, 퇴장 시각, 누적 시간, 자세/집중 점수를 조회한다.")
	@GetMapping("/{studyRecordId}")
	public StudyRecordDetailResponse detail(
			@Parameter(description = "스터디 기록 ID", example = "1") @PathVariable("studyRecordId") Long studyRecordId,
			Authentication authentication) {
		return studyRecordService.getDetail(studyRecordId, currentMemberId(authentication));
	}

	@Operation(summary = "스터디 진행 시간 동기화", description = "프론트에서 누적 집중/휴식/자리비움 시간을 중간 저장한다.")
	@PatchMapping("/{studyRecordId}/progress")
	public ProgressResponse progress(
			@Parameter(description = "스터디 기록 ID", example = "1") @PathVariable("studyRecordId") Long studyRecordId,
			Authentication authentication, @Valid @RequestBody ProgressRequest request) {
		return studyRecordService.progress(studyRecordId, currentMemberId(authentication), request);
	}

	@Operation(summary = "스터디 종료", description = "최종 시간을 확정하고 세션 중 저장된 감지 이벤트를 집계해 점수를 계산한다. "
			+ "감지 이벤트는 이 요청으로 보내지 않는다 — 자세는 posture-frames/posture-checks, 졸음·휴대폰은 "
			+ "drowsiness-checks/phone-checks로 발생 즉시 저장된다.")
	@PatchMapping("/{studyRecordId}/end")
	public EndResponse end(
			@Parameter(description = "스터디 기록 ID", example = "1") @PathVariable("studyRecordId") Long studyRecordId,
			Authentication authentication, @Valid @RequestBody EndRequest request) {
		return studyRecordService.end(studyRecordId, currentMemberId(authentication), request);
	}

	private Long currentMemberId(Authentication authentication) {
		return (Long) authentication.getPrincipal();
	}
}
