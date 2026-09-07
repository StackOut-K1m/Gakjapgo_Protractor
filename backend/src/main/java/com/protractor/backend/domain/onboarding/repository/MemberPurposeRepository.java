package com.protractor.backend.domain.onboarding.repository;

import com.protractor.backend.domain.onboarding.entity.MemberPurpose;
import com.protractor.backend.domain.onboarding.entity.MemberPurposeId;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MemberPurposeRepository extends JpaRepository<MemberPurpose, MemberPurposeId> {

    /**
     * 회원의 목적을 문자열로만 조회한다.
     *
     * <p>
     * 엔티티로 조회하면 영속성 컨텍스트(1차 캐시)에 남아, 이후 "벌크 삭제 → 같은 키 재삽입" 교체 과정에서
     * merge가 캐시의 옛 엔티티에 붙어 INSERT를 건너뛴다(행이 조용히 유실됨). 반드시 스칼라 조회를 유지할 것.
     */
    @Query("select mp.purpose from MemberPurpose mp where mp.memberId = :memberId order by mp.purpose asc")
    List<String> findPurposesByMemberId(@Param("memberId") Long memberId);

    /**
     * 회원의 목적 전체 삭제. 목적 교체(삭제 후 재삽입) 시 사용한다.
     * 벌크 쿼리라 호출 즉시 실행되어, 같은 트랜잭션의 재삽입과 순서가 꼬이지 않는다.
     */
    @Modifying
    @Query("delete from MemberPurpose mp where mp.memberId = :memberId")
    void deleteAllByMemberId(@Param("memberId") Long memberId);
}
