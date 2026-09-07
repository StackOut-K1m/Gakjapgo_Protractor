package com.protractor.backend.domain.calibration.controller;

import com.protractor.backend.domain.calibration.dto.CalibrationRequest;
import com.protractor.backend.domain.calibration.dto.CalibrationResponse;
import com.protractor.backend.domain.calibration.dto.MessageResponse;
import com.protractor.backend.domain.calibration.service.CalibrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 자세 기준선(캘리브레이션) API. 세션 시작 전에 바른 자세를 등록한다.
 *
 * <p>
 * 경로·메서드는 명세의 "기준 자세 캘리브레이션" 3종을 그대로 따른다. 다만 본문은 명세의 원시
 * {@code landmarks}가 아니라 브라우저가 계산해 보낸 기준선({@code baseline})을 받는다. 원시 좌표를
 * 저장하면 판정할 때마다 같은 계산을 다시 해야 하고, 얼굴이 드러나는 좌표를 계속 보관하는 부담도 생긴다.
 *
 * <p>
 * 경로의 {@code me}는 액세스 토큰에서 푼다. 회원 식별자를 요청으로 받으면 남의 기준선을 조회·삭제·덮어쓸 수
 * 있으므로, 세 엔드포인트 모두 {@link Authentication}에 담긴 회원만 다룬다.
 */
@Tag(name = "Calibration", description = "자세 기준선 API — 바른 자세 등록/조회/삭제")
@RestController
@RequestMapping("/api/v1/members/me/calibration")
@RequiredArgsConstructor
public class CalibrationController {

	private final CalibrationService calibrationService;

	@Operation(summary = "기준 자세 캘리브레이션 등록", description = "회원당 1건이라 다시 보내면 덮어쓴다. 명세를 따라 POST를 쓰지만 동작은 등록/갱신 겸용이다.")
	@PostMapping
	public CalibrationResponse save(Authentication authentication, @Valid @RequestBody CalibrationRequest request) {
		return calibrationService.save(currentMemberId(authentication), request);
	}

	@Operation(summary = "기준 자세 조회", description = "없으면 404. 프론트는 이때 캘리브레이션 화면을 띄운다.")
	@GetMapping
	public CalibrationResponse get(Authentication authentication) {
		return calibrationService.get(currentMemberId(authentication));
	}

	@Operation(summary = "기준 자세 삭제(재설정)", description = "기준선을 지운다. 지운 뒤에는 다시 등록할 때까지 자세 판정이 전부 보류된다.")
	@DeleteMapping
	public MessageResponse delete(Authentication authentication) {
		calibrationService.delete(currentMemberId(authentication));
		return new MessageResponse("기준 자세를 삭제했습니다.");
	}

	private Long currentMemberId(Authentication authentication) {
		return (Long) authentication.getPrincipal();
	}
}
