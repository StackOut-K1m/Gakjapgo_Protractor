package com.protractor.backend.domain.studyroom.repository;

import com.protractor.backend.domain.studyroom.entity.StudyRoomPhaseRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StudyRoomPhaseRecordRepository extends JpaRepository<StudyRoomPhaseRecord, Long> {

	/**
	 * 방의 현재 최대 sequence. 기록이 없으면 0을 반환한다.
	 *
	 * <p>
	 * (study_room_id, sequence)가 UNIQUE라, 타이머를 재시작할 때 sequence를 1로 되돌리면 중복이 된다. 이 값 +1부터
	 * 이어가야 한다.
	 */
	@Query("SELECT COALESCE(MAX(p.sequence), 0) FROM StudyRoomPhaseRecord p WHERE p.studyRoomId = :roomId")
	int findMaxSequence(@Param("roomId") Long roomId);
}
