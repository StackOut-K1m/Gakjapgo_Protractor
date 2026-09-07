package com.protractor.backend.domain.report.repository;

import com.protractor.backend.domain.report.dto.DailyStudyRow;
import com.protractor.backend.domain.report.dto.EventCategoryRow;
import com.protractor.backend.domain.report.dto.StudyRecordRow;
import com.protractor.backend.domain.report.dto.StudySpanRow;
import com.protractor.backend.domain.studyrecord.entity.Event;
import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * 리포트 전용 주간 집계 조회. 기록의 저장·수정은 스터디룸/기록 도메인 담당이므로 읽기 전용
 * {@link Repository}로 선언한다.
 *
 * <p>
 * 기간 절단 기준: 학습 기록은 study_date(학습일 — 자정 롤오버로 하루 단위 분할됨), 감지 이벤트는
 * started_at(실제 발생 시각)이다. 이벤트에는 학습일 개념이 없어 발생 시각을 그대로 쓴다.
 */
public interface ReportMetricsQueryRepository extends Repository<StudyRecord, Long> {

    /** 기간 내 내 기록 행 전체. 합산·평균·일별 분해는 서비스에서 계산한다. */
    @Query("""
            select new com.protractor.backend.domain.report.dto.StudyRecordRow(
                sr.studyDate, sr.totalStudySeconds, sr.focusedSeconds,
                sr.breakSeconds, sr.awaySeconds,
                sr.goodPostureRatio, sr.focusScore, sr.neckScore, sr.chinRestScore,
                sr.shoulderTiltScore, sr.totalScore,
                sr.warningCount, sr.stretchingAttemptCount, sr.stretchingCompletedCount)
            from StudyRecord sr
            where sr.memberId = :memberId and sr.studyDate >= :fromAt and sr.studyDate < :toAt
            """)
    List<StudyRecordRow> findRecords(@Param("memberId") Long memberId,
            @Param("fromAt") LocalDate fromAt, @Param("toAt") LocalDate toAt);

    /**
     * 기간 내 "언제부터 언제까지 방에 있었는지"와 그 중 순공부 시간. 시간대 분포에만 쓴다.
     *
     * <p>
     * 아직 나가지 않았거나(leftAt null) 들어온 시각이 없는 행은 뺀다 — 구간을 알 수 없어 어느
     * 시간대에 넣을지 정할 방법이 없다. 순공부가 0인 행도 분포에 기여하지 않으므로 함께 뺀다.
     */
    @Query("""
            select new com.protractor.backend.domain.report.dto.StudySpanRow(
                sr.joinedAt, sr.leftAt, sr.focusedSeconds)
            from StudyRecord sr
            where sr.memberId = :memberId and sr.studyDate >= :fromAt and sr.studyDate < :toAt
                and sr.joinedAt is not null and sr.leftAt is not null and sr.focusedSeconds > 0
            """)
    List<StudySpanRow> findStudySpans(@Param("memberId") Long memberId,
            @Param("fromAt") LocalDate fromAt, @Param("toAt") LocalDate toAt);

    /**
     * 기간 내 하루 단위 학습 기록 + 그 방 이름. 학습 캘린더가 달 단위로 쓴다.
     *
     * <p>
     * 방 이름을 얻으려 StudyRoom과 조인하지만, 방이 지워진 기록도 달력에서 사라지면 안 되므로
     * left join 이다(그런 행의 이름은 null이고 서비스가 걸러낸다).
     */
    @Query("""
            select new com.protractor.backend.domain.report.dto.DailyStudyRow(
                sr.studyDate, sr.totalStudySeconds, sr.focusedSeconds, sr.goodPostureRatio, room.title)
            from StudyRecord sr
            left join StudyRoom room on room.id = sr.studyRoomId
            where sr.memberId = :memberId and sr.studyDate >= :fromDate and sr.studyDate <= :toDate
            order by sr.studyDate
            """)
    List<DailyStudyRow> findDailyStudy(@Param("memberId") Long memberId,
            @Param("fromDate") LocalDate fromDate, @Param("toDate") LocalDate toDate);

    /**
     * 기간 내 감지 이벤트 카운트와 지속 시간 합. 스트레칭 수행 이벤트는 감지가 아니라서 제외한다.
     * (자리비움은 현재 이벤트로 저장되지 않고 study_records.away_seconds로만 남는다 — 카운트는 0이 정상)
     *
     * <p>
     * duration_seconds는 해소 시점에 채워지므로 진행 중이던 이벤트는 null이다. coalesce로 0을 넣어
     * 합계가 통째로 null이 되는 것을 막는다.
     */
    @Query("""
            select new com.protractor.backend.domain.report.dto.EventCategoryRow(
                e.eventType, e.detail, e.bodyPart, count(e), sum(coalesce(e.durationSeconds, 0)))
            from Event e
            join StudyRecord sr on sr.id = e.studyRecordId
            where sr.memberId = :memberId
                and e.eventType <> 'STRETCHING'
                and e.startedAt >= :fromAt and e.startedAt < :toAt
            group by e.eventType, e.detail, e.bodyPart
            """)
    List<EventCategoryRow> countEventsByCategory(@Param("memberId") Long memberId,
            @Param("fromAt") LocalDateTime fromAt, @Param("toAt") LocalDateTime toAt);

    /**
     * 기간 내 "가장 안 좋았던 자세" 후보 — 심각도, 지속 시간 순.
     * 상세 페이지 하이라이트에 쓴다. Pageable로 1건만 가져온다.
     */
    @Query("""
            select e
            from Event e
            join StudyRecord sr on sr.id = e.studyRecordId
            where sr.memberId = :memberId
                and e.eventType = 'POSTURE'
                and e.startedAt >= :fromAt and e.startedAt < :toAt
            order by e.severity desc nulls last, e.durationSeconds desc nulls last, e.id desc
            """)
    List<Event> findWorstPostureEvents(@Param("memberId") Long memberId,
            @Param("fromAt") LocalDateTime fromAt, @Param("toAt") LocalDateTime toAt, Pageable pageable);
}
