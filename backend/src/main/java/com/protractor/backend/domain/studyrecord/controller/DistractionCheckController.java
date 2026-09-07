package com.protractor.backend.domain.studyrecord.controller;

import com.protractor.backend.domain.studyrecord.dto.DistractionCheckResponse;
import com.protractor.backend.domain.studyrecord.dto.DrowsinessCheckRequest;
import com.protractor.backend.domain.studyrecord.dto.PhoneCheckRequest;
import com.protractor.backend.domain.studyrecord.service.DistractionCheckService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 집중 방해 이벤트 저장 API — 졸음·휴대폰.
 *
 * <p>
 * 경로 앞부분을 자세({@code PostureController})와 같은 {@code /study-sessions}로 둔다. 명세의 sessionId는
 * 이 프로젝트의 study_record_id와 같은 값이고, 셋 다 "세션에 이벤트를 붙이는" 같은 일을 한다.
 *
 * <p>
 * 컨트롤러를 자세와 합치지 않은 이유는 도메인이 다르기 때문이다. 졸음·휴대폰은 자세가 아니라서 body_part도 detail도 없고,
 * {@code Event.drowsy}/{@code Event.phoneUsed} 팩토리와 요청 DTO가 모두 studyrecord 쪽에 있다.
 *
 * <p>
 * 명세에는 신규 항목으로 추가해야 한다.
 */
@Tag(name = "DistractionCheck", description = "집중 방해 이벤트 저장 API — 졸음·휴대폰")
@RestController
@RequestMapping("/api/v1/study-sessions")
@RequiredArgsConstructor
public class DistractionCheckController {

	private final DistractionCheckService distractionCheckService;

	@Operation(summary = "졸음 감지 이벤트 저장", description = "브라우저가 확정한 졸음 한 건을 감지 즉시 저장한다. "
			+ "예전에는 세션 종료 요청에 목록으로 실어 보냈는데, 창이 강제로 닫히면 그 세션의 기록이 전부 사라졌다.")
	@ResponseStatus(HttpStatus.CREATED)
	@PostMapping("/{sessionId}/drowsiness-checks")
	public DistractionCheckResponse drowsiness(
			@Parameter(description = "세션 id(study_record_id)", example = "1") @PathVariable("sessionId") Long sessionId,
			Authentication authentication, @Valid @RequestBody DrowsinessCheckRequest request) {
		return distractionCheckService.recordDrowsiness(sessionId, currentMemberId(authentication), request);
	}

	@Operation(summary = "휴대폰 사용 이벤트 저장", description = "브라우저(YOLO)가 확정한 휴대폰 사용 구간 한 건을 구간이 닫히는 즉시 저장한다.")
	@ResponseStatus(HttpStatus.CREATED)
	@PostMapping("/{sessionId}/phone-checks")
	public DistractionCheckResponse phone(
			@Parameter(description = "세션 id(study_record_id)", example = "1") @PathVariable("sessionId") Long sessionId,
			Authentication authentication, @Valid @RequestBody PhoneCheckRequest request) {
		return distractionCheckService.recordPhone(sessionId, currentMemberId(authentication), request);
	}

	private Long currentMemberId(Authentication authentication) {
		return (Long) authentication.getPrincipal();
	}
}
