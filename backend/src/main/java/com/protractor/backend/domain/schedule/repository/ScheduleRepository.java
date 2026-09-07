package com.protractor.backend.domain.schedule.repository;

import com.protractor.backend.domain.schedule.entity.Schedule;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ScheduleRepository extends JpaRepository<Schedule, Long> {

    /** 월 단위 캘린더 조회. 날짜순 → 같은 날짜면 등록순으로 정렬한다. */
    List<Schedule> findAllByMemberIdAndTargetDateBetweenOrderByTargetDateAscIdAsc(
            Long memberId, LocalDate start, LocalDate end);

    /**
     * D-day 를 켠 일정 중 아직 지나지 않은 것을 가까운 순으로.
     *
     * <p>메서드 이름으로 짓지 않고 JPQL 을 쓴다. dDayEnabled 는 앞 두 글자가 대문자라
     * 이름 규칙(...AndDDayEnabledTrue...)으로는 프로퍼티를 되찾지 못한다.
     */
    @Query("""
            select s from Schedule s
            where s.memberId = :memberId
              and s.dDayEnabled = true
              and s.targetDate >= :from
            order by s.targetDate asc, s.id asc
            """)
    List<Schedule> findUpcomingDDay(@Param("memberId") Long memberId,
                                    @Param("from") LocalDate from,
                                    Pageable pageable);
}
