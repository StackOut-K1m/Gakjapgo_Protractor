package com.protractor.backend.domain.studyrecord.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 감지 이벤트. 공식 스키마 {@code events} 매핑. 하나의 study_record(세션)에 여러 이벤트가 붙는다.
 *
 * 프론트/AI가 브라우저에서 MediaPipe로 판정한 확정 이벤트만 저장한다. 매 프레임 좌표는 데이터가 과도하게 늘어나므로 저장하지
 * 않는다. 이벤트 종류에 따라 채우지 않는 컬럼이 있어 대부분 nullable이다.
 */
@Entity
@Table(name = "events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder
public class Event {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "event_id")
	private Long id;

	/** 어느 세션의 이벤트인지. 종료 시 이 값으로 집계한다. */
	@Column(name = "study_record_id", nullable = false)
	private Long studyRecordId;

	/** 스트레칭 이벤트일 때 어떤 스트레칭 가이드인지 연결한다. */
	@Column(name = "stretching_id")
	private Long stretchingId;

	@Column(name = "event_type", nullable = false, length = 30)
	private String eventType; // POSTURE, DROWSY, STRETCHING, PHONE

	/** 같은 body_part 안에서 세부 종류를 구분한다. 자세는 FORWARD_HEAD / SHOULDER_TILT / CHIN_REST. */
	@Column(name = "detail", length = 50)
	private String detail;

	/** 자세 이벤트일 때만 채운다. 부위별 점수 계산에 사용한다. */
	@Column(name = "body_part", length = 30)
	private String bodyPart; // NECK, SHOULDER, BACK

	@Column(name = "deviation_degrees")
	private BigDecimal deviationDegrees; // 기준선 이탈 각도

	@Column(name = "alert_channel", length = 30)
	private String alertChannel; // VOICE, TEXT, VISUAL

	@Column(name = "resolved_by", length = 30)
	private String resolvedBy;

	@Column(name = "severity")
	private Integer severity; // 1~5

	@Column(name = "started_at", nullable = false)
	private LocalDateTime startedAt;

	@Column(name = "ended_at")
	private LocalDateTime endedAt;

	/** 종료 시 나쁜 자세 시간을 합산할 때 사용한다. */
	@Column(name = "duration_seconds")
	private Integer durationSeconds;

	/** 스트레칭 수행 완성도(%). */
	@Column(name = "completion_rate")
	private BigDecimal completionRate;

	@Column(name = "capture_url", length = 1000)
	private String captureUrl;

	/**
	 * 판정 근거 스냅샷(JSON). 자세 이벤트는 판정에 쓴 캘리브레이션 기준선과 피처값을 여기 남긴다.
	 *
	 * <p>
	 * calibrations는 회원당 1행이라 재캘리브레이션하면 덮어써진다. 그래서 어떤 기준선으로 판정했는지를 이벤트 쪽에 함께
	 * 남겨야 나중에 판정을 재현하고 방식별 정확도를 비교할 수 있다.
	 */
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "metadata")
	private String metadata;

	@CreationTimestamp
	@Column(name = "created_at", updatable = false)
	private LocalDateTime createdAt;

	/** 자세 감지 이벤트. eventType을 고정해 호출부에서 오타가 생기지 않게 한다. */
	public static Event posture(Long studyRecordId, String bodyPart, BigDecimal deviationDegrees, String alertChannel,
			Integer severity, LocalDateTime startedAt, LocalDateTime endedAt, Integer durationSeconds,
			String captureUrl) {
		return postureDetected(studyRecordId, bodyPart, null, deviationDegrees, alertChannel, severity, startedAt,
				endedAt, durationSeconds, captureUrl, null);
	}

	/**
	 * 서버가 판정한 자세 이벤트.
	 *
	 * <p>
	 * body_part만으로는 자세 종류를 나눌 수 없다(어깨 부위에 여러 자세가 붙을 수 있다). detail을 비우면 종류별로
	 * 집계할 수 없으므로 서버 판정에서는 반드시 채운다.
	 */
	public static Event postureDetected(Long studyRecordId, String bodyPart, String detail,
			BigDecimal deviationDegrees, String alertChannel, Integer severity, LocalDateTime startedAt,
			LocalDateTime endedAt, Integer durationSeconds, String captureUrl, String metadata) {
		return Event.builder().studyRecordId(studyRecordId).eventType("POSTURE").bodyPart(bodyPart).detail(detail)
				.deviationDegrees(deviationDegrees).alertChannel(alertChannel).severity(severity).startedAt(startedAt)
				.endedAt(endedAt).durationSeconds(durationSeconds).captureUrl(captureUrl).metadata(metadata).build();
	}

	/**
	 * 나쁜 자세가 해소됐을 때 종료 시각과 지속 시간을 채운다.
	 *
	 * <p>
	 * 자세 이벤트는 30초 지속이 확정된 시점에 먼저 저장되고(ended_at 없음), 해소 시점에 이 메서드로 완성된다.
	 * duration_seconds는 세션 종료 시 bad_posture_seconds 합산에 쓰이므로 여기서 반드시 채운다.
	 */
	public void resolve(LocalDateTime endedAt, String resolvedBy) {
		this.endedAt = endedAt;
		this.resolvedBy = resolvedBy;
		this.durationSeconds = (int) Duration.between(this.startedAt, endedAt).toSeconds();
	}

	/** 졸음 감지 이벤트. 요청의 level을 severity에 저장한다. */
	public static Event drowsy(Long studyRecordId, Integer severity, LocalDateTime detectedAt) {
		return Event.builder().studyRecordId(studyRecordId).eventType("DROWSY").severity(severity).startedAt(detectedAt)
				.build();
	}

	/**
	 * 휴대폰 사용 이벤트.
	 *
	 * <p>
	 * 자세가 아니라 집중을 깨는 행동이므로 body_part·detail을 비우고 event_type만으로 구분한다. 자세로 넣으면
	 * 부위별 점수(neck/shoulder)에 섞여 들어가 목·어깨가 나쁜 것처럼 계산된다.
	 *
	 * <p>
	 * 브라우저의 YOLO 감지가 확정한 구간만 저장한다(연속 확인 + 쿨다운). duration_seconds는 화면에서 폰이 사라질
	 * 때까지의 시간이라 실제 사용 시간보다 짧을 수 있다.
	 */
	public static Event phoneUsed(Long studyRecordId, LocalDateTime startedAt, LocalDateTime endedAt,
			Integer durationSeconds) {
		return Event.builder().studyRecordId(studyRecordId).eventType("PHONE").startedAt(startedAt).endedAt(endedAt)
				.durationSeconds(durationSeconds).build();
	}

	/** 스트레칭 시작 이벤트. 완료/건너뛰기 시 같은 행을 갱신한다. */
	public static Event stretchingStarted(Long studyRecordId, Long stretchingId, LocalDateTime startedAt) {
		return Event.builder().studyRecordId(studyRecordId).stretchingId(stretchingId).eventType("STRETCHING")
				.detail("STARTED").startedAt(startedAt).build();
	}

	/** 스트레칭 완료 처리. 완료율과 실제 진행 시간을 저장한다. */
	public void completeStretching(BigDecimal completionRate, LocalDateTime completedAt) {
		this.detail = "COMPLETED";
		this.completionRate = completionRate;
		this.endedAt = completedAt;
		this.durationSeconds = secondsBetween(this.startedAt, completedAt);
	}

	/** 스트레칭 건너뛰기 처리. 사유가 있으면 resolved_by에 남긴다. */
	public void skipStretching(String reason, LocalDateTime skippedAt) {
		this.detail = "SKIPPED";
		this.resolvedBy = reason;
		this.completionRate = BigDecimal.ZERO;
		this.endedAt = skippedAt;
		this.durationSeconds = secondsBetween(this.startedAt, skippedAt);
	}

	public boolean isStretching() {
		return "STRETCHING".equals(this.eventType);
	}

	private int secondsBetween(LocalDateTime startedAt, LocalDateTime endedAt) {
		if (startedAt == null || endedAt == null || endedAt.isBefore(startedAt)) {
			return 0;
		}
		return Math.toIntExact(Duration.between(startedAt, endedAt).getSeconds());
	}
}
