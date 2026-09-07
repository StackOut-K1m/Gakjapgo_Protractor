package com.protractor.backend.domain.ranking.repository;

import com.protractor.backend.domain.member.entity.AccountStatus;
import com.protractor.backend.domain.ranking.dto.RankingSourceRow;
import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * 학습 기록을 회원별로 합산하는 랭킹 원천 조회다.
 *
 * <p><b>기간은 학습일(studyDate)로 자른다.</b> 이 테이블을 날짜로 자르는 곳이 네 군데인데
 * (랭킹·리포트·알림·학습요약) 예전에는 랭킹만 퇴장 시각을 썼다. 같은 학습이 화면마다 다른 날짜에
 * 붙어, 홈의 "이번 주 공부 시간"과 랭킹의 숫자가 서로 맞지 않았다.
 *
 * <p>{@code endReason is not null}(= 종료된 기록만) 조건도 뺐다. 그 조건 때문에 밤새 공부하고
 * 아직 안 나간 사람이 랭킹에서 통째로 빠졌다. focusedSeconds는 30초마다 동기화되므로 진행 중이어도
 * 값 자체는 쓸 수 있고, 랭킹은 점수가 아니라 이 값만 쓴다.
 */
public interface RankingQueryRepository extends Repository<StudyRecord, Long> {

    @Query("""
            select new com.protractor.backend.domain.ranking.dto.RankingSourceRow(
                sr.memberId, m.nickname, coalesce(sum(sr.focusedSeconds), 0L))
            from StudyRecord sr
            join Member m on m.id = sr.memberId
            where sr.studyDate >= :startAt
              and sr.studyDate < :endAt
              and sr.focusedSeconds > 0
              and m.accountStatus = :activeStatus
              and m.deletedAt is null
            group by sr.memberId, m.nickname
            """)
    List<RankingSourceRow> sumFocusedSecondsByMember(@Param("startAt") LocalDate startAt,
            @Param("endAt") LocalDate endAt, @Param("activeStatus") AccountStatus activeStatus);
}
