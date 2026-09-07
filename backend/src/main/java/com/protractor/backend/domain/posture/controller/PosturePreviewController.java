package com.protractor.backend.domain.posture.controller;

import com.protractor.backend.domain.posture.dto.PostureFrameRequest;
import com.protractor.backend.domain.posture.dto.PosturePreviewResponse;
import com.protractor.backend.domain.posture.service.PostureAnalysisService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 기준선 없는 자세 판정 API — 입장 준비화면 전용.
 *
 * <p>
 * 컨트롤러를 {@link PostureController}와 나눈 이유는 경로 때문이다. 그쪽은
 * {@code /study-sessions/{sessionId}/...} 아래에 있는데 이 판정에는 세션이 없다. 세션 경로에 매달아 두면 쓰지 않는
 * sessionId를 아무 값이나 넣어 보내게 된다.
 *
 * <p>
 * 저장하는 것이 없고 회원 정보도 읽지 않는다. 그래도 인증은 받는다 — 학습된 모델을 통과시키는 입구라, 열어 두면 누구나 모델의 판단을
 * 마음껏 뽑아 볼 수 있다.
 *
 * <p>
 * 명세에는 신규 항목으로 추가해야 한다.
 */
@Tag(name = "PosturePreview", description = "기준선 없는 자세 판정 API — 입장 준비화면")
@RestController
@RequestMapping("/api/v1/posture-frames")
@RequiredArgsConstructor
public class PosturePreviewController {

	private final PostureAnalysisService postureAnalysisService;

	@Operation(summary = "기준선 없는 한 프레임 판정", description = "캘리브레이션 전에 지금 자세가 나쁜지만 판정한다. "
			+ "저장하지 않고 30초 윈도우도 거치지 않으며, 이탈 각도는 기준선이 필요해 내려주지 않는다. "
			+ "절대 기준을 학습한 모델을 가진 판정기(hybrid)만 실제로 답하고, 규칙 기반은 NO_BASELINE 보류로 답한다.")
	@PostMapping("/preview")
	public PosturePreviewResponse preview(@Valid @RequestBody PostureFrameRequest request) {
		return postureAnalysisService.preview(request);
	}
}
