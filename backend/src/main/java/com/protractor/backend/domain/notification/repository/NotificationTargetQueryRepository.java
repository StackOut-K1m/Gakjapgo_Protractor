package com.protractor.backend.domain.notification.repository;

import com.protractor.backend.domain.member.entity.AccountStatus;
import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * 리포트 안내 알림의 발송 대상 조회. 기록의 저장·수정은 스터디룸/기록 도메인 담당이므로
 * 읽기 전용 {@link Repository}로 선언한다(ReportMetricsQueryRepository와 같은 방식).
 */
public interface NotificationTargetQueryRepository extends Repository<StudyRecord, Long> {

    /**
     * 기간 내 학습 기록이 있는 정상(ACTIVE) 회원. 기록이 없는 회원에게 "리포트를 확인하세요"는
     * 빈 화면 안내라 대상에서 뺀다. 탈퇴·정지 회원도 로그인할 수 없으므로 뺀다.
     */
    @Query("""
            select distinct sr.memberId
            from StudyRecord sr
            join Member m on m.id = sr.memberId
            where sr.studyDate >= :fromAt and sr.studyDate < :toAt
                and m.accountStatus = :status
                and m.deletedAt is null
            """)
    List<Long> findActiveMembersStudiedBetween(@Param("fromAt") LocalDate fromAt,
            @Param("toAt") LocalDate toAt,
            @Param("status") AccountStatus status);
}
