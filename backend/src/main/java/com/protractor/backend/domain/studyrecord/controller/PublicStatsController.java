package com.protractor.backend.domain.studyrecord.controller;

import com.protractor.backend.domain.studyrecord.dto.ActiveUsersResponse;
import com.protractor.backend.domain.studyrecord.service.StudyRecordService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 로그인 없이 볼 수 있는 통계.
 *
 * <p>
 * 홈 화면은 로그인하지 않은 사람에게 먼저 보이는 화면이라, 서비스가 살아 있다는 신호를 줄 값이
 * 필요하다. 개인을 특정할 수 있는 값은 여기서 내보내지 않는다.
 */
@Tag(name = "PublicStats", description = "비로그인 공개 통계 API")
@RestController
@RequestMapping("/api/v1/public")
@RequiredArgsConstructor
public class PublicStatsController {

	private final StudyRecordService studyRecordService;

	@Operation(summary = "지금 공부 중인 인원 조회", description = "스터디룸에 들어와 있는 회원 수를 센다. 로그인 없이 조회할 수 있다. "
			+ "창을 닫은 사람은 최대 23초(이탈 유예 20초 + 정리 주기 3초) 뒤에 빠지므로 그 사이에는 실제보다 조금 크게 나올 수 있다.")
	@GetMapping("/active-users")
	public ActiveUsersResponse activeUsers() {
		return studyRecordService.getActiveUsers();
	}
}
