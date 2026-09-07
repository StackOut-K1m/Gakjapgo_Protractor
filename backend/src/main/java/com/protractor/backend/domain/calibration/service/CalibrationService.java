package com.protractor.backend.domain.calibration.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.protractor.backend.domain.calibration.dto.CalibrationRequest;
import com.protractor.backend.domain.calibration.dto.CalibrationResponse;
import com.protractor.backend.domain.calibration.entity.Calibration;
import com.protractor.backend.domain.calibration.repository.CalibrationRepository;
import com.protractor.backend.domain.posture.dto.PostureBaseline;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 자세 기준선 저장·조회.
 *
 * <p>
 * 기준선은 DB에 JSON 문자열로 들어가고 판정할 때는 객체로 필요하다. 그 변환을 이 서비스에 모아 두어, 판정 쪽에서 JSON을 직접 다루지
 * 않게 한다.
 */
@Service
@RequiredArgsConstructor
public class CalibrationService {

	private final CalibrationRepository calibrationRepository;
	private final ObjectMapper objectMapper;

	/**
	 * 캘리브레이션 저장. 회원당 1행이라 있으면 갱신하고 없으면 만든다.
	 *
	 * <p>
	 * 덮어쓰기 때문에 과거 기준선은 남지 않는다. 판정 근거는 이벤트마다 events.metadata에 따로 남긴다.
	 */
	@Transactional
	public CalibrationResponse save(Long memberId, CalibrationRequest request) {
		String baselineJson = toJson(request.baseline());
		Calibration calibration = calibrationRepository.findByMemberId(memberId).map(existing -> {
			existing.recalibrate(baselineJson, request.captureUrl(), request.confidence());
			return existing;
		}).orElseGet(() -> calibrationRepository
				.save(Calibration.of(memberId, baselineJson, request.captureUrl(), request.confidence())));
		return CalibrationResponse.of(calibration, request.baseline());
	}

	@Transactional(readOnly = true)
	public CalibrationResponse get(Long memberId) {
		Calibration calibration = findOrThrow(memberId);
		return CalibrationResponse.of(calibration, parse(calibration.getBaselineData()));
	}

	/**
	 * 기준선 삭제(재설정). 없는 것을 지우려 하면 404로 알린다.
	 *
	 * <p>
	 * 지운 뒤에는 판정이 전부 보류된다. 기준선 없이 절대 임계값으로 판정하면 체형에 따라 한쪽은 계속 경고를 받고 다른 쪽은 아무리
	 * 구부려도 걸리지 않기 때문이다.
	 */
	@Transactional
	public void delete(Long memberId) {
		calibrationRepository.delete(findOrThrow(memberId));
	}

	/** 판정에 쓸 기준선. 없으면 캘리브레이션을 먼저 하도록 404로 알린다. */
	@Transactional(readOnly = true)
	public PostureBaseline getBaseline(Long memberId) {
		return parse(findOrThrow(memberId).getBaselineData());
	}

	private Calibration findOrThrow(Long memberId) {
		return calibrationRepository.findByMemberId(memberId).orElseThrow(() -> new ResponseStatusException(
				HttpStatus.NOT_FOUND, "캘리브레이션이 없습니다. 바른 자세를 먼저 등록해야 합니다: memberId=" + memberId));
	}

	private String toJson(PostureBaseline baseline) {
		try {
			return objectMapper.writeValueAsString(baseline);
		} catch (JsonProcessingException e) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "기준선을 JSON으로 변환하지 못했습니다", e);
		}
	}

	/** 저장된 기준선이 깨졌다면 판정을 진행하는 것보다 실패시키는 편이 낫다(잘못된 기준으로 경고가 나가는 것을 막는다). */
	private PostureBaseline parse(String json) {
		try {
			return objectMapper.readValue(json, PostureBaseline.class);
		} catch (JsonProcessingException e) {
			throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "저장된 기준선을 읽지 못했습니다", e);
		}
	}
}
