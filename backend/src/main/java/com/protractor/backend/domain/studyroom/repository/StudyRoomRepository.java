package com.protractor.backend.domain.studyroom.repository;

import com.protractor.backend.domain.studyroom.entity.RoomStatus;
import com.protractor.backend.domain.studyroom.entity.StudyRoom;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StudyRoomRepository extends JpaRepository<StudyRoom, Long> {

	/**
	 * 목록 검색. 각 조건은 null이면 무시된다(선택 필터).
	 *
	 * <p>
	 * 소프트 삭제 필터(deleted_at IS NULL)는 엔티티의 &#64;SQLRestriction이 자동 적용한다.
	 */
	@Query("""
			SELECT r FROM StudyRoom r
			WHERE (:keyword IS NULL OR r.title LIKE CONCAT('%', :keyword, '%'))
			  AND (:status IS NULL OR r.status = :status)
			  AND (:roomType IS NULL OR r.roomType = :roomType)
			""")
	Page<StudyRoom> search(@Param("keyword") String keyword, @Param("status") RoomStatus status,
			@Param("roomType") String roomType, Pageable pageable);

	/**
	 * 만료 시각이 지난 방. 정리 스케줄러가 쓴다.
	 *
	 * <p>
	 * 이미 삭제된 방은 엔티티의 &#64;SQLRestriction이 걸러 주므로 조건에 넣지 않는다. 만료 시각이 null인 방(사람이
	 * 들어와 있는 방)은 애초에 대상이 아니다.
	 */
	List<StudyRoom> findByExpiresAtBefore(LocalDateTime now);

	/**
	 * 개인화 추천의 후보 풀이다. 현재 인원 수는 study_records에서 계산하므로 서브쿼리로 정원 미달만 먼저 보장한다.
	 * 관심 태그 점수는 회원별 값이라 서비스에서 계산한다.
	 */
	@Query("""
			SELECT r FROM StudyRoom r
			WHERE r.status = :running
			  AND r.isLocked = false
			  AND r.hostMemberId <> :memberId
			  AND (SELECT COUNT(sr) FROM StudyRecord sr
			       WHERE sr.studyRoomId = r.id AND sr.leftAt IS NULL) < r.maxMembers
			ORDER BY r.createdAt DESC, r.id DESC
			""")
	List<StudyRoom> findRecommendableCandidates(@Param("memberId") Long memberId,
			@Param("running") RoomStatus running, Pageable pageable);

	/** 관심 태그가 일치하는 후보를 먼저 제한 없이 찾기 위한 전용 조회다. */
	@Query("""
			SELECT r FROM StudyRoom r
			WHERE r.status = :running
			  AND r.isLocked = false
			  AND r.hostMemberId <> :memberId
			  AND r.studyTagId IN :studyTagIds
			  AND (SELECT COUNT(sr) FROM StudyRecord sr
			       WHERE sr.studyRoomId = r.id AND sr.leftAt IS NULL) < r.maxMembers
			ORDER BY r.createdAt DESC, r.id DESC
			""")
	List<StudyRoom> findRecommendableCandidatesByStudyTagIds(@Param("memberId") Long memberId,
			@Param("running") RoomStatus running, @Param("studyTagIds") List<Long> studyTagIds, Pageable pageable);
}
