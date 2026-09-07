package com.protractor.backend.domain.calibration.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

/**
 * 자세 판정 기준선. 공식 스키마 {@code calibrations} 매핑.
 *
 * <p>
 * 세션 시작 시 "바른 자세"를 몇 초 캡처해 얻은 피처 평균을 담는다. 자세 판정은 절대값이 아니라 이 기준선 대비 편차로 하기 때문에, 목이
 * 원래 긴 사람이나 어깨가 원래 비대칭인 사람도 자기 기준으로 평가받는다.
 *
 * <p>
 * member_id에 UNIQUE가 걸려 있어 회원당 1행이다. 다시 캘리브레이션하면 기존 행을 덮어쓰므로 과거 기준선은 남지 않는다. 그래서 판정
 * 시점의 기준선은 events.metadata에 따로 스냅샷으로 남긴다. 그러지 않으면 나중에 판정을 재현할 수 없다.
 */
@Entity
@Table(name = "calibrations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder
public class Calibration {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "calibration_id")
	private Long id;

	@Column(name = "member_id", nullable = false)
	private Long memberId;

	/** 기준선 JSON. PostureBaseline을 직렬화한 문자열이다. */
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "baseline_data", nullable = false)
	private String baselineData;

	/** 캘리브레이션 당시 캡처 이미지(동의 시). */
	@Column(name = "capture_url", length = 1000)
	private String captureUrl;

	/** 캘리브레이션 품질(0~100). 낮으면 다시 잡도록 안내한다. */
	@Column(name = "confidence")
	private BigDecimal confidence;

	@Column(name = "calibrated_at", nullable = false)
	private LocalDateTime calibratedAt;

	@CreationTimestamp
	@Column(name = "created_at", updatable = false)
	private LocalDateTime createdAt;

	@UpdateTimestamp
	@Column(name = "updated_at")
	private LocalDateTime updatedAt;

	public static Calibration of(Long memberId, String baselineData, String captureUrl, BigDecimal confidence) {
		return Calibration.builder().memberId(memberId).baselineData(baselineData).captureUrl(captureUrl)
				.confidence(confidence).calibratedAt(LocalDateTime.now()).build();
	}

	/** 재캘리브레이션. 회원당 1행이라 새로 만들지 않고 기존 행을 갱신한다. */
	public void recalibrate(String baselineData, String captureUrl, BigDecimal confidence) {
		this.baselineData = baselineData;
		this.captureUrl = captureUrl;
		this.confidence = confidence;
		this.calibratedAt = LocalDateTime.now();
	}
}
