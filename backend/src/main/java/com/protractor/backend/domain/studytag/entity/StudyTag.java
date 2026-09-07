package com.protractor.backend.domain.studytag.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 관심(스터디) 태그. 온보딩·프로필·스터디룸이 공용으로 참조하는 기준 데이터다.
 *
 * <p>
 * 태그 목록은 schema.sql의 INSERT로 관리한다(관리 API 없음). 태그를 없앨 때는 행을 지우지 않고
 * enabled=false로 내린다. 이미 그 태그를 고른 회원의 선택 이력을 깨뜨리지 않기 위해서다.
 */
@Entity
@Table(name = "study_tags")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StudyTag {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "study_tag_id")
    private Long id;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    private void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    private void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
