package com.protractor.backend.domain.studyroom.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * 스터디룸 엔티티. 공식 스키마 {@code study_rooms} 테이블과 매핑된다.
 *
 * <p>
 * 소프트 삭제 방식이라 {@link SQLRestriction}으로 조회 시 deleted_at IS NULL 인 행만 노출한다. DDL은
 * schema.sql이 관리하므로(ddl-auto: none) 컬럼명을 스키마와 정확히 맞춘다.
 *
 * <p>
 * 값 변경은 update()/softDelete()로만 가능하도록 &#64;Setter를 두지 않았다.
 */
@Entity
@Table(name = "study_rooms")
@SQLRestriction("deleted_at IS NULL")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder
public class StudyRoom {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "study_room_id")
	private Long id;

	/** 방장 회원 ID. 생성 요청자가 가진 JWT의 memberId를 저장한다. */
	@Column(name = "host_member_id", nullable = false)
	private Long hostMemberId;

	@Column(name = "title", nullable = false, length = 100)
	private String title;

	@Enumerated(EnumType.STRING)
	@Column(name = "status", nullable = false, length = 20)
	private RoomStatus status;

	@Column(name = "room_type", nullable = false, length = 30)
	private String roomType;

	@Column(name = "max_members", nullable = false)
	private int maxMembers;

	/** 선택 항목이라 값이 없을 수 있어 Integer를 사용한다. */
	@Column(name = "planned_duration_seconds")
	private Integer plannedDurationSeconds;

	/** 집중 시간(초). API는 분 단위로 주고받는다. */
	@Column(name = "focus_duration_seconds", nullable = false)
	private int focusDurationSeconds;

	/** 휴식 시간(초). */
	@Column(name = "break_duration_seconds", nullable = false)
	private int breakDurationSeconds;

	@Column(name = "stretching_enabled", nullable = false)
	private boolean stretchingEnabled;

	/** 방 카테고리. study_tags FK(단일). NOT NULL이라 값 없으면 서비스에서 기본값을 채운다. */
	@Column(name = "study_tag_id", nullable = false)
	private Long studyTagId;

	/** 자유 해시태그(고정 목록 아님). 구분 규칙은 프론트/서비스가 정한다. */
	@Column(name = "hash_tags", length = 500)
	private String hashTags;

	/** 비공개(비밀번호) 방 여부. */
	@Column(name = "is_locked", nullable = false)
	private boolean isLocked;

	/** 방 비밀번호. 응답 DTO에는 절대 노출하지 않는다. */
	@Column(name = "password", length = 255)
	private String password;

	@Column(name = "rules", columnDefinition = "TEXT")
	private String rules;

	@Column(name = "description", columnDefinition = "TEXT")
	private String description;

	@Column(name = "thumbnail_image_url", length = 1000)
	private String thumbnailImageUrl;

	@Column(name = "started_at")
	private LocalDateTime startedAt;

	/** 방 종료 시각. 개인 세션 종료와는 별개이며 방 자동 종료 기능은 미구현. */
	@Column(name = "ended_at")
	private LocalDateTime endedAt;

	@Column(name = "expires_at")
	private LocalDateTime expiresAt;

	@Column(name = "end_reason", length = 50)
	private String endReason;

	@CreationTimestamp
	@Column(name = "created_at", updatable = false)
	private LocalDateTime createdAt;

	@UpdateTimestamp
	@Column(name = "updated_at")
	private LocalDateTime updatedAt;

	/** 값이 채워져 있으면 삭제된 방이다. */
	@Column(name = "deleted_at")
	private LocalDateTime deletedAt;

	/** 부분 수정. null이 아닌 필드만 반영한다(PATCH 시맨틱). */
	public void update(String title, Integer maxMembers, Integer focusDurationSeconds, Integer breakDurationSeconds,
			Boolean stretchingEnabled, Long studyTagId, String hashTags, Boolean isLocked, String password,
			String rules, String description, String thumbnailImageUrl) {
		if (title != null) {
			this.title = title;
		}
		if (maxMembers != null) {
			this.maxMembers = maxMembers;
		}
		if (focusDurationSeconds != null) {
			this.focusDurationSeconds = focusDurationSeconds;
		}
		if (breakDurationSeconds != null) {
			this.breakDurationSeconds = breakDurationSeconds;
		}
		if (stretchingEnabled != null) {
			this.stretchingEnabled = stretchingEnabled;
		}
		if (studyTagId != null) {
			this.studyTagId = studyTagId;
		}
		if (hashTags != null) {
			this.hashTags = hashTags;
		}
		if (isLocked != null) {
			this.isLocked = isLocked;
		}
		if (password != null) {
			this.password = password;
		}
		if (rules != null) {
			this.rules = rules;
		}
		if (description != null) {
			this.description = description;
		}
		if (thumbnailImageUrl != null) {
			this.thumbnailImageUrl = thumbnailImageUrl;
		}
	}

	/** 소프트 삭제: 실제 삭제 대신 deleted_at을 채운다. */
	public void softDelete() {
		this.deletedAt = LocalDateTime.now();
	}

	/**
	 * 방장을 다른 참여자에게 넘긴다.
	 *
	 * <p>
	 * 방장이 나가도 남은 사람들이 계속 공부할 수 있어야 하므로, 방을 닫는 대신 방장 권한만 이전한다.
	 */
	public void changeHost(Long newHostMemberId) {
		this.hostMemberId = newHostMemberId;
	}

	/**
	 * 방을 진행중(RUNNING)으로 바꾼다. 시작 시각은 최초 1회만 기록한다.
	 *
	 * <p>
	 * 사람이 들어와 방이 살아났다는 뜻이므로 만료 예약과 종료 흔적을 함께 지운다. 지우지 않으면 준비 화면 만료 시각이 남아 공부
	 * 중인 방이 스케줄러에 지워지고, ENDED에서 돌아온 방은 종료 시각이 남아 이력이 어긋난다.
	 */
	public void startSession() {
		this.status = RoomStatus.RUNNING;
		if (this.startedAt == null) {
			this.startedAt = LocalDateTime.now();
		}
		this.expiresAt = null;
		this.endedAt = null;
		this.endReason = null;
	}

	/**
	 * 사람이 모두 나가 방이 비었다. 방을 지우는 대신 종료(ENDED)로 두고 만료 시각을 심는다.
	 *
	 * <p>
	 * 즉시 지우면 잘못 눌러 나간 사람이 돌아올 방법이 없다. 목록에서는 빠지지만(RUNNING이 아니므로) URL을 들고 있으면
	 * 만료 전까지 다시 들어올 수 있고, 만료된 뒤에는 스케줄러가 지운다.
	 */
	public void endSession(String reason, Duration retention) {
		this.status = RoomStatus.ENDED;
		this.endedAt = LocalDateTime.now();
		this.endReason = reason;
		this.expiresAt = this.endedAt.plus(retention);
	}

	/**
	 * 방을 만든 직후처럼 아직 아무도 들어오지 않은 방에 만료 시각을 심는다.
	 *
	 * <p>
	 * 개설만 하고 입장하지 않은 방이 영구히 쌓이는 것을 막는다. 입장하면 {@link #startSession()}이 해제한다.
	 */
	public void scheduleExpiry(Duration ttl) {
		this.expiresAt = LocalDateTime.now().plus(ttl);
	}
}
