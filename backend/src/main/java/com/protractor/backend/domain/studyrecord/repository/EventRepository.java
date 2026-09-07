package com.protractor.backend.domain.studyrecord.repository;

import com.protractor.backend.domain.studyrecord.dto.PostureInterval;
import com.protractor.backend.domain.studyrecord.entity.Event;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 감지 이벤트 조회. 세션 종료 시 점수 계산에 쓰는 집계 쿼리를 모아 둔다.
 *
 * 이벤트를 전부 조회해 자바에서 세지 않고 DB에서 집계한다.
 */
public interface EventRepository extends JpaRepository<Event, Long> {

	/** 종료 API 재호출 시 이벤트가 중복 저장되지 않도록 기존 세션 이벤트를 교체한다. */
	void deleteByStudyRecordId(Long studyRecordId);

	/** 종료 API 재호출 시 자세/졸음 이벤트만 교체하고, 세션 중 저장된 스트레칭 이벤트는 유지한다. */
	void deleteByStudyRecordIdAndEventTypeIn(Long studyRecordId, Collection<String> eventTypes);

	/**
	 * 나쁜 자세 구간 목록. 합산은 {@link PostureInterval#mergedSeconds}가 한다.
	 *
	 * <p>
	 * duration_seconds를 SUM하지 않는 이유는 자세가 동시에 잡히기 때문이다. 거북목인 채로 턱을 괴면 두 이벤트가 같은 시간대에
	 * 열려서, 길이를 더하면 그 시간이 두 번 세어진다.
	 *
	 * <p>
	 * 아직 닫히지 않은 이벤트(ended_at이 빈 행)는 길이를 알 수 없어 제외한다. 종료 시각에는 미리 닫고 집계하므로 정상 경로에서는
	 * 남지 않는다.
	 */
	@Query("SELECT new com.protractor.backend.domain.studyrecord.dto.PostureInterval(e.startedAt, e.endedAt) FROM Event e "
			+ "WHERE e.studyRecordId = :recordId AND e.eventType = 'POSTURE' AND e.endedAt IS NOT NULL "
			+ "ORDER BY e.startedAt")
	List<PostureInterval> findPostureIntervals(@Param("recordId") Long recordId);

	/** 아직 닫히지 않은 자세 이벤트 전부. 측정이 멈추거나 세션이 끝날 때 한 번에 닫는 데 쓴다. */
	List<Event> findByStudyRecordIdAndEventTypeAndEndedAtIsNull(Long studyRecordId, String eventType);

	/** 경고 횟수 = 자세 + 졸음 이벤트 수. */
	@Query("SELECT COUNT(e) FROM Event e "
			+ "WHERE e.studyRecordId = :recordId AND e.eventType IN ('POSTURE', 'DROWSY')")
	long countWarnings(@Param("recordId") Long recordId);

	/** 부위별 자세 이벤트 수. 목/어깨/등을 각각 세는 데 재사용한다. */
	@Query("SELECT COUNT(e) FROM Event e "
			+ "WHERE e.studyRecordId = :recordId AND e.eventType = 'POSTURE' AND e.bodyPart = :bodyPart")
	long countPostureByBodyPart(@Param("recordId") Long recordId, @Param("bodyPart") String bodyPart);

	/**
	 * 세부 자세별 이벤트 수. 부위별 점수 계산에 쓴다.
	 *
	 * <p>
	 * 한 body_part에 여러 자세가 붙을 수 있어 bodyPart로는 종류를 나눌 수 없다. 점수는 detail 기준으로 센다.
	 */
	@Query("SELECT COUNT(e) FROM Event e "
			+ "WHERE e.studyRecordId = :recordId AND e.eventType = 'POSTURE' AND e.detail = :detail")
	long countPostureByDetail(@Param("recordId") Long recordId, @Param("detail") String detail);

	/**
	 * 세부 자세별 나쁜 자세 시간 합(초). 부위 점수가 "순공부 시간 중 그 자세였던 비율"로 계산되므로
	 * 건수가 아니라 시간을 합산한다.
	 *
	 * <p>
	 * SUM은 duration_seconds가 null(아직 안 닫힌 이벤트)인 행을 건너뛴다. 종료 처리(finish)가 열린
	 * 이벤트를 먼저 닫은 뒤에 호출되므로 실제로 빠지는 행은 거의 없고, 남았다면 길이를 모르는 것이라 빼는 게 맞다.
	 */
	@Query("SELECT COALESCE(SUM(e.durationSeconds), 0) FROM Event e "
			+ "WHERE e.studyRecordId = :recordId AND e.eventType = 'POSTURE' AND e.detail = :detail")
	long sumPostureSecondsByDetail(@Param("recordId") Long recordId, @Param("detail") String detail);

	/**
	 * 아직 해소되지 않은(ended_at이 비어 있는) 자세 이벤트. 해소 시점에 종료 시각을 채우기 위해 찾는다.
	 *
	 * <p>
	 * 같은 세션·같은 세부 자세에서 미해소 이벤트는 최대 1건이지만, 서버 재시작 등으로 남을 수 있어 가장 최근 것을 쓴다.
	 */
	Optional<Event> findFirstByStudyRecordIdAndDetailAndEndedAtIsNullOrderByStartedAtDesc(Long studyRecordId,
			String detail);

	/** 스트레칭 시도 횟수. 시작 후 완료/스킵까지 같은 행을 갱신하므로 STRETCHING 행 수가 시도 수다. */
	@Query("SELECT COUNT(e) FROM Event e WHERE e.studyRecordId = :recordId AND e.eventType = 'STRETCHING'")
	long countStretchingAttempts(@Param("recordId") Long recordId);

	/** 스트레칭 완료 횟수. */
	@Query("SELECT COUNT(e) FROM Event e "
			+ "WHERE e.studyRecordId = :recordId AND e.eventType = 'STRETCHING' AND e.detail = 'COMPLETED'")
	long countStretchingCompleted(@Param("recordId") Long recordId);

	/**
	 * 아직 끝나지 않은(STARTED) 스트레칭 이벤트. 건너뛰기가 새 행을 만들지 않고 이 행을 닫는 데 쓴다.
	 *
	 * <p>
	 * 없으면 새로 만든다 — 시작을 알리지 않고 건너뛰는 클라이언트도 있을 수 있다. 여러 건이 남아 있는 경우(끝내지 않고 창을 닫는 등)
	 * 가장 최근 것을 집는다.
	 */
	Optional<Event> findFirstByStudyRecordIdAndStretchingIdAndDetailOrderByIdDesc(Long studyRecordId, Long stretchingId,
			String detail);
}
