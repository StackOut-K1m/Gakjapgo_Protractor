package com.protractor.backend.domain.mypage.repository;

import com.protractor.backend.domain.mypage.dto.MyStudyRoomRow;
import com.protractor.backend.domain.mypage.dto.StudyTotals;
import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import com.protractor.backend.domain.studyroom.entity.RoomStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * 마이페이지 전용 조회. 스터디 기록(study_records)을 읽기만 하며, 기록의 저장·수정은
 * 스터디룸/기록 도메인이 담당하므로 CRUD가 없는 {@link Repository}로 선언한다.
 *
 * <p>
 * study_records는 <b>(study_room_id, member_id, study_date)</b>가 UNIQUE다. 한 행은 "그 방에서
 * 그 날 공부한 것"이라, 자정을 넘겨 쓴 방은 행이 여러 개다. 방 단위 숫자가 필요하면 GROUP BY로
 * 합쳐야 한다.
 */
public interface MyPageQueryRepository extends Repository<StudyRecord, Long> {

    /** 내 전체 기록의 누적 합계. 기록이 없어도 0이 담긴 한 행이 돌아온다. */
    @Query("""
            select new com.protractor.backend.domain.mypage.dto.StudyTotals(
                coalesce(sum(sr.totalStudySeconds), 0L),
                coalesce(sum(sr.focusedSeconds), 0L),
                coalesce(sum(sr.awaySeconds), 0L))
            from StudyRecord sr
            where sr.memberId = :memberId
            """)
    StudyTotals sumTotals(@Param("memberId") Long memberId);

    /** 참여 중인 스터디 수 = 종료되지 않은 방의 내 기록 수. 삭제된 방은 StudyRoom의 @SQLRestriction이 걸러준다. */
    @Query("""
            select count(sr)
            from StudyRecord sr
            join StudyRoom r on r.id = sr.studyRoomId
            where sr.memberId = :memberId and r.status <> :ended
            """)
    long countRoomsNotEnded(@Param("memberId") Long memberId, @Param("ended") RoomStatus ended);

    /**
     * 최근 참여 순 스터디 목록. 방 하나가 한 줄이다.
     *
     * <p>
     * <b>네이티브 쿼리인 이유</b> — StudyRoom에 {@code @SQLRestriction("deleted_at IS NULL")}이
     * 걸려 있어서, JPQL로 조인하면 삭제된 방의 기록이 통째로 빠진다. 그런데 방은 마지막 사람이
     * 나가고 30초 뒤에 지워지므로(RoomLifecycleService), <b>공부를 제대로 마칠수록 목록에서
     * 사라지는</b> 꼴이 됐다. 여기는 지난 기록을 보여 주는 자리라 지워진 방도 남겨야 한다.
     * 그 제약은 엔티티에 붙어 있어 JPQL로는 끌 수 없다.
     *
     * <p>
     * <b>GROUP BY 하는 이유</b> — 기록은 학습일마다 나뉘어서, 자정을 넘겨 쓴 방은 같은 방이 두
     * 줄로 뜬다. 방 단위로 합치고 시간은 더한다. 참여 시각은 가장 최근 것을 쓴다 — "최근 스터디"
     * 목록이라 마지막으로 공부한 때가 기준이어야 정렬과 표시가 맞는다.
     */
    @Query(value = """
            select r.study_room_id     as roomId,
                   r.title             as title,
                   r.status            as status,
                   r.host_member_id    as hostMemberId,
                   max(sr.joined_at)   as joinedAt,
                   -- MySQL의 SUM(INT)은 DECIMAL을 돌려준다. 그대로 두면 Long으로 못 받아서
                   -- 정수로 되돌린다.
                   cast(sum(sr.total_study_seconds) as signed) as totalStudySeconds,
                   cast(sum(sr.focused_seconds) as signed)     as focusedSeconds,
                   cast(sum(sr.away_seconds) as signed)        as awaySeconds
            from study_records sr
            join study_rooms r on r.study_room_id = sr.study_room_id
            where sr.member_id = :memberId
            group by r.study_room_id, r.title, r.status, r.host_member_id
            order by max(sr.joined_at) desc, r.study_room_id desc
            """,
            countQuery = """
            select count(distinct sr.study_room_id)
            from study_records sr
            join study_rooms r on r.study_room_id = sr.study_room_id
            where sr.member_id = :memberId
            """,
            nativeQuery = true)
    Page<MyStudyRoomRow> findRecentRooms(@Param("memberId") Long memberId, Pageable pageable);
}
