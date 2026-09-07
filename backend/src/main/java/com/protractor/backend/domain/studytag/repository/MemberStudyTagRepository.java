package com.protractor.backend.domain.studytag.repository;

import com.protractor.backend.domain.studytag.entity.MemberStudyTag;
import com.protractor.backend.domain.studytag.entity.MemberStudyTagId;
import com.protractor.backend.domain.studytag.entity.StudyTag;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MemberStudyTagRepository extends JpaRepository<MemberStudyTag, MemberStudyTagId> {

    /** 회원이 고른 태그를 이름까지 붙여 조회한다. 비활성 태그도 이미 고른 것이면 그대로 보여준다(선택 이력 보존). */
    @Query("""
            select t
            from StudyTag t
            join MemberStudyTag mst on mst.studyTagId = t.id
            where mst.memberId = :memberId
            order by t.id asc
            """)
    List<StudyTag> findTagsByMemberId(@Param("memberId") Long memberId);

    /**
     * 회원의 태그 연결 전체 삭제. 태그 교체(삭제 후 재삽입) 시 사용한다.
     *
     * <p>
     * 파생 delete 대신 벌크 쿼리를 쓰는 이유: 벌크 쿼리는 호출 즉시 실행되어, 같은 트랜잭션에서 곧바로
     * 같은 (member_id, study_tag_id)를 다시 넣어도 INSERT가 DELETE보다 먼저 나가 PK 충돌이 나는 문제가 없다.
     */
    @Modifying
    @Query("delete from MemberStudyTag mst where mst.memberId = :memberId")
    void deleteAllByMemberId(@Param("memberId") Long memberId);
}
