package com.protractor.backend.domain.report.repository;

import com.protractor.backend.domain.report.entity.Report;
import com.protractor.backend.domain.report.entity.ReportStatus;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReportRepository extends JpaRepository<Report, Long> {

    /** 본인 소유 확인을 겸한 단건 조회. 남의 리포트는 결과가 비어 404로 처리한다. */
    Optional<Report> findByIdAndMemberId(Long id, Long memberId);

    Page<Report> findByMemberId(Long memberId, Pageable pageable);

    /** 목록용 — 특정 상태(FAILED)를 뺀 내 리포트. */
    Page<Report> findByMemberIdAndStatusNot(Long memberId, ReportStatus status, Pageable pageable);

    /**
     * 같은 기간·특정 상태의 리포트 조회(최신순).
     * 진행 중(PENDING/RUNNING) 중복 생성 방지와, summary의 완료 소견(aiFeedback) 조회에 함께 쓴다.
     */
    @Query("""
            select r
            from Report r
            where r.memberId = :memberId
                and r.periodStartDate = :startDate
                and r.periodEndDate = :endDate
                and r.status in :statuses
            order by r.id desc
            """)
    List<Report> findByPeriodAndStatusIn(@Param("memberId") Long memberId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate,
            @Param("statuses") Collection<ReportStatus> statuses);

    /**
     * 같은 기간의 리포트 전부(상태 무관, 최신순).
     *
     * <p>
     * 재생성이 새 행을 쌓지 않고 기존 행을 되살려 쓰기 위한 조회다. 위 findByPeriodAndStatusIn 과
     * 달리 FAILED 도 가져온다 — 실패로 끝난 행이야말로 다시 써야 할 자리다.
     */
    List<Report> findByMemberIdAndPeriodStartDateAndPeriodEndDateOrderByIdDesc(Long memberId,
            LocalDate periodStartDate, LocalDate periodEndDate);
}
