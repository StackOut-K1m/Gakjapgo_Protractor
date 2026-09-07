package com.protractor.backend.domain.studyrecord.repository;

import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StudyRecordRepository extends JpaRepository<StudyRecord, Long> {

    @Query("SELECT COALESCE(SUM(r.focusedSeconds), 0) FROM StudyRecord r WHERE r.memberId = :memberId")
    int sumFocusedSecondsByMember(@Param("memberId") Long memberId);

	/**
	 * 이 기록이 그 회원의 것인지. 감지 이벤트를 실시간으로 받는 입구가 쓴다.
	 *
	 * <p>
	 * 존재 여부(existsById)만 확인하면 남의 세션에 이벤트를 꽂을 수 있다. 로그인만 되어 있으면 sessionId를 바꿔 보내는
	 * 것으로 충분하기 때문이다. 감지 이벤트는 상대의 점수를 깎으므로 소유 확인까지 한다.
	 */
	boolean existsByIdAndMemberId(Long id, Long memberId);

	/**
	 * 같은 날 같은 방의 기록. 재입장 판단용이다.
	 *
	 * <p>
	 * study_records는 (study_room_id, member_id, study_date)가 UNIQUE라 하루에 한 행이다. 날짜가 바뀌면
	 * 같은 방이라도 다른 행이 된다.
	 */
	Optional<StudyRecord> findByStudyRoomIdAndMemberIdAndStudyDate(Long studyRoomId, Long memberId,
			LocalDate studyDate);

	/**
	 * 이 방에서 아직 나가지 않은 기록. 퇴장·이탈 처리가 쓴다.
	 *
	 * <p>
	 * 날짜로 찾지 않는 이유는 자정을 넘긴 경우 때문이다. 23시 50분에 들어온 사람을 0시 10분에 내보내면 그 사람의 기록은
	 * 어제 날짜다. "오늘 행"을 찾으면 없다고 나온다. 지금 방에 있는 사람을 다루는 일에는 날짜가 아니라 퇴장 여부가 기준이다.
	 *
	 * <p>
	 * 한 방에 열린 기록은 하나뿐이지만, 혹시 어긋나더라도 최근 것을 집도록 id 역순으로 첫 건만 가져온다.
	 */
	Optional<StudyRecord> findFirstByStudyRoomIdAndMemberIdAndLeftAtIsNullOrderByIdDesc(Long studyRoomId,
			Long memberId);

	/** 퇴장 시각이 없는 기록 = 현재 참여자. */
	List<StudyRecord> findByStudyRoomIdAndLeftAtIsNull(Long studyRoomId);

	/**
	 * 아직 방에 있는 것으로 기록된 모든 참여 기록.
	 *
	 * <p>
	 * 서버 재시작 직후 정리에 쓴다. 접속 여부는 서버 메모리에만 있어 재시작하면 사라지는데, 이 기록은 DB에 남아 유령 참여자가
	 * 된다(정원·접속자 수·방 목록이 모두 어긋난다).
	 */
	List<StudyRecord> findByLeftAtIsNull();

	/** 현재 참여자 수. 목록을 가져오지 않고 DB에서 개수만 센다. */
	long countByStudyRoomIdAndLeftAtIsNull(Long studyRoomId);

	/**
	 * 여러 방의 현재 참여자 수를 한 번에 센다(목록 조회의 N+1 방지). 참여자가 0인 방은 결과에 포함되지 않으므로, 호출 측에서 기본값
	 * 0으로 채운다.
	 */
	@Query("SELECT r.studyRoomId AS roomId, COUNT(r) AS memberCount FROM StudyRecord r "
			+ "WHERE r.leftAt IS NULL AND r.studyRoomId IN :roomIds GROUP BY r.studyRoomId")
	List<RoomMemberCount> countActiveByRoomIds(@Param("roomIds") List<Long> roomIds);

	/**
	 * 한 회원이 특정 기간에 공부한 집중 시간의 합(초).
	 *
	 * <p>
	 * 기준은 학습일(studyDate)이다. 자정을 넘긴 학습은 서버가 날짜별로 나눠 두므로 그대로 더하면 된다. 진행 중인 세션도
	 * 30초마다 focusedSeconds가 갱신되므로 함께 더한다.
	 *
	 * <p>
	 * 합산 대상은 totalStudySeconds가 아니라 focusedSeconds다. 휴식·자리비움까지 더하면 공부한 시간이 실제보다 부풀어
	 * 보인다.
	 *
	 * <p>
	 * 조건에 맞는 행이 하나도 없으면 SUM이 null이라 COALESCE로 0을 만들어 돌려준다. 그래야 호출 측에서 int로 받아도
	 * 안전하다.
	 *
	 * @param from 시작일(포함)
	 * @param to   끝일(미포함). 주 경계가 겹치지 않도록 미포함으로 둔다
	 */
	@Query("SELECT COALESCE(SUM(r.focusedSeconds), 0) FROM StudyRecord r "
			+ "WHERE r.memberId = :memberId AND r.studyDate >= :from AND r.studyDate < :to")
	int sumFocusedSecondsByMemberAndPeriod(@Param("memberId") Long memberId, @Param("from") LocalDate from,
			@Param("to") LocalDate to);

	/**
	 * 연속 학습일수 계산용. 실제로 공부한 날짜만 최근 순으로 가져온다.
	 *
	 * <p>
	 * 들어왔다 바로 나간 기록(0초)은 공부한 날로 세지 않는다.
	 */
	@Query("SELECT r.studyDate FROM StudyRecord r "
			+ "WHERE r.memberId = :memberId AND r.focusedSeconds > 0 AND r.studyDate >= :since "
			+ "ORDER BY r.studyDate DESC")
	List<LocalDate> findStudiedDatesSince(@Param("memberId") Long memberId, @Param("since") LocalDate since);

	/**
	 * 지금 스터디룸에 있는 인원 수. 홈 화면의 "지금 공부 중" 숫자에 쓴다.
	 *
	 * <p>
	 * 퇴장 시각이 없는 기록을 센다. 창을 닫은 사람은 최대 23초(RoomLifecyclePolicy의 이탈 유예 20초 +
	 * 정리 주기 3초) 뒤에 빠지므로 그 사이에는 실제보다 조금 크게 나올 수 있다. 대략적인 규모를 보여 주는
	 * 값이라 그 정도 오차는 감수한다.
	 */
	@Query("SELECT COUNT(DISTINCT r.memberId) FROM StudyRecord r WHERE r.leftAt IS NULL")
	long countStudyingMembers();

	/** 방별 현재 참여자 수 프로젝션. */
	interface RoomMemberCount {
		Long getRoomId();

		long getMemberCount();
	}
}
