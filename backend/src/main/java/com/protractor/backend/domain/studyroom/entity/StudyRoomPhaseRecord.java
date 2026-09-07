package com.protractor.backend.domain.studyroom.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * 방 타이머 페이즈 1회 기록. 공식 스키마 {@code study_room_phase_records} 매핑.
 *
 * <p>
 * 집중(FOCUS)/휴식(BREAK) 같은 한 구간이 시작될 때 행이 만들어지고, 다음 페이즈로 넘어가거나 타이머가 멈출 때
 * {@code ended_at}이 채워진다. (study_room_id, sequence) 조합이 UNIQUE다.
 */
@Entity
@Table(name = "study_room_phase_records")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder
public class StudyRoomPhaseRecord {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "study_room_phase_record_id")
	private Long id;

	@Column(name = "study_room_id", nullable = false)
	private Long studyRoomId;

	/** FOCUS / BREAK (필요 시 STRETCHING 등 확장). */
	@Column(name = "phase_type", nullable = false, length = 30)
	private String phaseType;

	/** 방 안에서 몇 번째 페이즈인지(1부터). */
	@Column(name = "sequence", nullable = false)
	private int sequence;

	@Column(name = "started_at", nullable = false)
	private LocalDateTime startedAt;

	/** 비어 있으면 진행 중인 페이즈다. */
	@Column(name = "ended_at")
	private LocalDateTime endedAt;

	@CreationTimestamp
	@Column(name = "created_at", updatable = false)
	private LocalDateTime createdAt;

	@UpdateTimestamp
	@Column(name = "updated_at")
	private LocalDateTime updatedAt;

	/** 페이즈 시작. ended_at은 비워둔다. */
	public static StudyRoomPhaseRecord start(Long studyRoomId, String phaseType, int sequence,
			LocalDateTime startedAt) {
		return StudyRoomPhaseRecord.builder().studyRoomId(studyRoomId).phaseType(phaseType).sequence(sequence)
				.startedAt(startedAt).build();
	}

	/** 페이즈 종료 시각 기록. */
	public void end(LocalDateTime endedAt) {
		this.endedAt = endedAt;
	}
}
