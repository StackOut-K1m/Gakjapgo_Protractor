package com.protractor.backend.domain.posture.controller;

import com.protractor.backend.domain.posture.dto.PostureCheckRequest;
import com.protractor.backend.domain.posture.dto.PostureCheckResponse;
import com.protractor.backend.domain.posture.dto.PostureFrameRequest;
import com.protractor.backend.domain.posture.dto.PostureFrameResponse;
import com.protractor.backend.domain.posture.service.PostureAnalysisService;
import com.protractor.backend.domain.posture.service.PostureCheckService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 자세 판정 API.
 *
 * <p>
 * 명세의 {@code posture-checks}는 클라이언트가 <b>확정한</b> 이벤트를 받는 입구고, 여기
 * {@code posture-frames}는 서버가 직접 판정하기 위해 <b>원시 피처</b>를 받는 입구다. 둘은 역할이 다르다.
 *
 * <p>
 * 피처를 받는 엔드포인트는 명세에 아직 없다. 그래서 계약은 서버 판정 구조를 유지하되 경로만 명세의
 * {@code /api/v1/study-sessions/{sessionId}/...} 규칙에 맞춰 두었다. 명세에는 신규 항목으로 추가해야
 * 한다.
 *
 * <p>
 * 명세의 sessionId는 이 프로젝트의 study_record_id와 같은 값이다(방 입장 시 발급되는 세션 식별자).
 *
 * <p>
 * 지금은 REST로 받는다. WebSocket 의존성이 들어오면 전송 계층만 바꾸면 되도록 판정 로직은 서비스에 두었다.
 */
@Tag(name = "Posture", description = "자세 판정 API — 피처 수신/판정")
@RestController
@RequestMapping("/api/v1/study-sessions")
@RequiredArgsConstructor
public class PostureController {

	private final PostureAnalysisService postureAnalysisService;
	private final PostureCheckService postureCheckService;

	@Operation(summary = "자세 프레임 판정", description = "브라우저가 1초 주기로 피처 벡터를 보내면 서버가 3종을 판정하고, 30초 지속된 자세만 이벤트로 남긴다.")
	@PostMapping("/{sessionId}/posture-frames")
	public PostureFrameResponse analyze(@PathVariable Long sessionId, @Valid @RequestBody PostureFrameRequest request) {
		return postureAnalysisService.analyze(sessionId, request);
	}

	@Operation(summary = "자세 체크 결과 저장", description = "클라이언트가 확정한 자세 이벤트를 그대로 저장한다. 서버 판정을 쓰지 않는 환경용이다.")
	@ResponseStatus(HttpStatus.CREATED)
	@PostMapping("/{sessionId}/posture-checks")
	public PostureCheckResponse check(@PathVariable Long sessionId, @Valid @RequestBody PostureCheckRequest request) {
		return postureCheckService.record(sessionId, request);
	}
}
