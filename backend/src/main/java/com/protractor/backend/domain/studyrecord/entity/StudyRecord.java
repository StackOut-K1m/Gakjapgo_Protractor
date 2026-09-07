package com.protractor.backend.domain.studyrecord.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * 스터디 기록 = 한 회원이 한 방에서 하루 동안 공부한 것. 공식 스키마 {@code study_records} 매핑.
 *
 * <p>
 * 참여자 기록(joined_at/left_at)과 세션 통계를 한 테이블에서 겸용한다.
 * {@code (study_room_id, member_id, study_date)} 조합이 UNIQUE라, 같은 방이라도 날짜가 다르면 다른 행이 된다.
 * 하루 안에서는 나갔다 들어와도 같은 행에 이어 쌓는다({@link #rejoin()}).
 *
 * <p>
 * 이 엔티티의 id가 API의 sessionId 역할을 한다. 감지 이벤트(events)가 이 id로 연결되며, 자정을 지나 행이 나뉘면
 * id도 바뀌므로 클라이언트가 갈아타야 한다.
 */
@Entity
@Table(name = "study_records")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder
public class StudyRecord {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "study_record_id")
	private Long id;

	@Column(name = "study_room_id", nullable = false)
	private Long studyRoomId;

	@Column(name = "member_id", nullable = false)
	private Long memberId;

	/**
	 * 이 기록이 며칠의 공부인지. <b>기간을 자를 때 쓰는 기준이다.</b>
	 *
	 * <p>
	 * 랭킹·리포트·알림·학습요약 네 곳이 이 컬럼으로 기간을 자른다. 새로 날짜별 조회를 만들 때도 이 값을 쓴다.
	 *
	 * <p>
	 * 입장 시각(joinedAt)을 쓰지 않는 이유는 자정 때문이다. 23시에 시작해 1시에 끝낸 학습은 시작 시각으로 자르면 두
	 * 시간이 전부 어제 것이 된다. 자정을 지나면 서버가 이 행을 마감하고 다음 날짜로 새 행을 만들어(rollover) 하루씩
	 * 나눈다 — {@code StudyRecordService.progress} 참고.
	 */
	@Column(name = "study_date", nullable = false)
	private LocalDate studyDate;

	/**
	 * 입장 시각.
	 *
	 * <p>
	 * 집계에는 쓰지 않는다 — 그 역할은 {@link #studyDate}가 한다. 이 값은 "이 날 이 방에서 언제 시작했는지"를
	 * 보여 주는 용도다(참여자 목록의 입장 시각).
	 *
	 * <p>
	 * 하루 안에서는 한 번 정해지면 바뀌지 않는다. {@link #rejoin()}도 건드리지 않는다.
	 */
	@Column(name = "joined_at")
	private LocalDateTime joinedAt;

	/** 비어 있으면 아직 방에 있는 상태다. 날짜 집계에는 쓰지 않는다 — joinedAt 설명 참고. */
	@Column(name = "left_at")
	private LocalDateTime leftAt;

	// ── 누적 측정값. progress로 받은 값을 덮어쓴다 ──

	/** 집중+휴식+자리비움 합계. 서버가 계산한다. */
	@Column(name = "total_study_seconds", nullable = false)
	private int totalStudySeconds;

	@Column(name = "focused_seconds", nullable = false)
	private int focusedSeconds;

	@Column(name = "break_seconds", nullable = false)
	private int breakSeconds;

	@Column(name = "away_seconds", nullable = false)
	private int awaySeconds;

	/** 종료 시 서버가 감지 이벤트를 합산해 채운다. */
	@Column(name = "bad_posture_seconds", nullable = false)
	private int badPostureSeconds;

	/** COMPLETED / SYSTEM / POLICY */
	@Column(name = "end_reason", length = 50)
	private String endReason;

	// ── 종료 시 서버가 계산하는 점수·비율 (0~100, 소수 2자리) ──

	@Column(name = "good_posture_ratio")
	private BigDecimal goodPostureRatio;

	@Column(name = "focus_score")
	private BigDecimal focusScore;

	/** 거북목(FORWARD_HEAD) 점수. */
	@Column(name = "neck_score")
	private BigDecimal neckScore;

	/**
	 * 턱 괴기(CHIN_REST) 점수.
	 *
	 * <p>
	 * 원래 라운드숄더 점수 자리(shoulder_score)였다. 그 자세는 판정에서 빠지고 턱 괴기가 대신 들어왔는데,
	 * 이름과 내용이 달라 DB를 직접 볼 때마다 헷갈려서 컬럼 이름을 실제 내용에 맞게 바꿨다
	 * (20260805_08 마이그레이션 — 기존 DB는 그 SQL을 실행해야 이 코드와 맞는다).
	 */
	@Column(name = "chin_rest_score")
	private BigDecimal chinRestScore;

	/** 어깨 높낮이(SHOULDER_TILT) 점수. 원래 back_score 자리를 이 지표로 바꿔 쓴다. */
	@Column(name = "shoulder_tilt_score")
	private BigDecimal shoulderTiltScore;

	@Column(name = "total_score")
	private BigDecimal totalScore;

	// ── 카운트 ──

	@Column(name = "warning_count", nullable = false)
	private int warningCount;

	@Column(name = "stretching_attempt_count", nullable = false)
	private int stretchingAttemptCount;

	@Column(name = "stretching_completed_count", nullable = false)
	private int stretchingCompletedCount;

	@CreationTimestamp
	@Column(name = "created_at", updatable = false)
	private LocalDateTime createdAt;

	@UpdateTimestamp
	@Column(name = "updated_at")
	private LocalDateTime updatedAt;

	/** 입장 시 새 기록 생성. 누적값은 0으로 시작한다. 날짜는 서버 기준 오늘이다. */
	public static StudyRecord start(Long studyRoomId, Long memberId) {
		return start(studyRoomId, memberId, LocalDate.now());
	}

	/**
	 * 날짜를 지정해 새 기록을 만든다. 자정 롤오버가 다음 날짜 행을 만들 때 쓴다.
	 *
	 * @param carriedFocusedSeconds
	 *            직전 행에서 넘어온 시간(초). 마지막 동기화 이후 자정을 지나 쌓인 몫이라 새 날짜에 붙인다.
	 */
	public static StudyRecord startFrom(Long studyRoomId, Long memberId, LocalDate date, int carriedFocusedSeconds) {
		StudyRecord record = start(studyRoomId, memberId, date);
		record.syncProgress(Math.max(carriedFocusedSeconds, 0), 0, 0);
		return record;
	}

	private static StudyRecord start(Long studyRoomId, Long memberId, LocalDate date) {
		return StudyRecord.builder().studyRoomId(studyRoomId).memberId(memberId).studyDate(date)
				.joinedAt(LocalDateTime.now()).build();
	}

	/**
	 * 같은 날 같은 방에 다시 들어옴. (room, member, study_date)가 UNIQUE라서 새로 만들지 않고 퇴장 시각을 비운다.
	 *
	 * <p>
	 * 종료 사유도 함께 비운다. 이 값이 남아 있으면 progress/end가 "이미 종료된 세션"으로 보고 409를 내서, 재입장한 뒤에
	 * 공부한 시간과 자세 기록이 집계되지 않는다. 점수는 다음 종료 때 applyScores가 다시 계산해 덮어쓴다.
	 *
	 * <p>
	 * <b>joinedAt은 건드리지 않는다.</b> 그 날 그 방에서 처음 시작한 시각이라는 뜻을 지키기 위해서다. 재입장할 때마다
	 * 밀면 참여자 목록의 입장 시각이 계속 바뀐다.
	 */
	public void rejoin() {
		this.leftAt = null;
		this.endReason = null;
	}

	/**
	 * 진행 동기화. 클라이언트가 보낸 누적값으로 덮어쓴다(더하지 않는다).
	 *
	 * <p>
	 * 전송이 한 번 실패해도 다음 호출에 전체 누적값이 담겨 오므로 값이 어긋나지 않는다.
	 */
	public void syncProgress(int focusedSeconds, int breakSeconds, int awaySeconds) {
		this.focusedSeconds = focusedSeconds;
		this.breakSeconds = breakSeconds;
		this.awaySeconds = awaySeconds;
		this.totalStudySeconds = focusedSeconds + breakSeconds + awaySeconds;
	}

	/** 종료 처리. 점수는 applyScores로 따로 반영한다. */
	public void end(int focusedSeconds, int breakSeconds, int awaySeconds, String endReason) {
		syncProgress(focusedSeconds, breakSeconds, awaySeconds);
		this.endReason = endReason;
		this.leftAt = LocalDateTime.now();
	}

	/** 서버가 events 집계로 계산한 자세 통계·점수를 반영한다. */
	public void applyScores(int badPostureSeconds, int warningCount, int stretchingAttemptCount,
			int stretchingCompletedCount, BigDecimal goodPostureRatio, BigDecimal focusScore, BigDecimal neckScore,
			BigDecimal chinRestScore, BigDecimal shoulderTiltScore, BigDecimal totalScore) {
		this.badPostureSeconds = badPostureSeconds;
		this.warningCount = warningCount;
		this.stretchingAttemptCount = stretchingAttemptCount;
		this.stretchingCompletedCount = stretchingCompletedCount;
		this.goodPostureRatio = goodPostureRatio;
		this.focusScore = focusScore;
		this.neckScore = neckScore;
		this.chinRestScore = chinRestScore;
		this.shoulderTiltScore = shoulderTiltScore;
		this.totalScore = totalScore;
	}

	/** 세션 종료 없이 나가기. 퇴장 시각만 기록한다. */
	public void leave() {
		this.leftAt = LocalDateTime.now();
	}

	public boolean isActive() {
		return this.leftAt == null;
	}
}
