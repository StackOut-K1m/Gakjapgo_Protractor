package com.protractor.backend.domain.posture.controller;

import com.protractor.backend.domain.posture.dto.PostureDetectorResponse;
import com.protractor.backend.domain.posture.service.PostureDetector;
import com.protractor.backend.domain.posture.service.PostureDetectorRegistry;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 선택 가능한 자세 판정기 목록.
 *
 * <p>
 * {@link PostureController}와 나눈 이유는 자원이 다르기 때문이다. 저쪽은 세션 하나에 매달린 경로
 * ({@code /study-sessions/{sessionId}/...})인데, 판정기 목록은 세션과 무관한 서버 전체의 성질이다.
 *
 * <p>
 * 목록을 코드에 적지 않고 등록된 빈에서 만든다. 새 판정 방식을 추가할 때 이 컨트롤러도 프론트엔드도 고칠 필요가 없다.
 */
@Tag(name = "Posture", description = "자세 판정 API — 피처 수신/판정")
@RestController
@RequestMapping("/api/v1/posture-detectors")
@RequiredArgsConstructor
public class PostureDetectorController {

	private final PostureDetectorRegistry detectors;

	@Operation(summary = "판정기 목록 조회", description = "서버에 등록된 자세 판정 방식과 기본값을 준다. 판정 방식을 바꿔 가며 비교할 때 쓴다.")
	@GetMapping
	public List<PostureDetectorResponse> list() {
		PostureDetector defaultDetector = detectors.defaultDetector();
		return detectors.all().stream()
				.map(detector -> new PostureDetectorResponse(detector.key(), detector.name(), detector.description(),
						detector == defaultDetector))
				.toList();
	}
}
