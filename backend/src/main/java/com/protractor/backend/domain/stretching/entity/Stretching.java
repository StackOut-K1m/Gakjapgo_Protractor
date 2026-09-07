package com.protractor.backend.domain.stretching.entity;

import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

//DB의 stretchings 테이블에 있는 컬럼들을 Java에서는 이런 이름과 타입으로 불러서 사용할 거다
//DB랑 연결해야 하네 → @Entity
//테이블 이름이 다르네 → @Table
//PK가 필요하네 → @Id
//AUTO_INCREMENT네 → @GeneratedValue
//값을 읽어야 하네 → @Getter
//JPA가 생성자가 필요하네 → @NoArgsConstructor

@Entity // DB 테이블이라는 표시
@Table(name = "stretchings") // 어떤 테이블인지 알려줌
@Getter // 값을 읽을 수 있게 Getter를 붙인다.
@NoArgsConstructor(access = AccessLevel.PROTECTED) // JPA가 객체를 만들 수 있게 하자
public class Stretching {

	@Id // ID가 없으면 Entity로 관리가 잘 안된다.
	@GeneratedValue(strategy = GenerationType.IDENTITY) // DB의 AUTO_INCREMENT로 기본 키 값을 자동 생성한다.
	@Column(name = "stretching_id")
	private Long id;

	@Column(name = "name", nullable = false, length = 100)
	private String name;

	@Column(name = "target_part", nullable = false, length = 50)
	private String targetPart;

	@Column(name = "guide_text", nullable = false, columnDefinition = "TEXT")
	private String guideText;

	@Column(name = "highlight_landmarks", columnDefinition = "JSON")
	private String highlightLandmarks;

	@Column(name = "hold_seconds", nullable = false)
	private int holdSeconds;

	@Column(name = "enabled", nullable = false)
	private boolean enabled;

	@Column(name = "sort_order", nullable = false)
	private int sortOrder;

	@CreationTimestamp
	@Column(name = "created_at", updatable = false)
	private LocalDateTime createdAt;

	@UpdateTimestamp
	@Column(name = "updated_at")
	private LocalDateTime updatedAt;

}
