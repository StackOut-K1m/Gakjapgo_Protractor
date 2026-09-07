package com.protractor.backend.domain.studytag.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 회원이 고른 관심 태그(회원-태그 연결). 온보딩(저장·수정)에서 통째로 갈아끼우는 방식으로 쓴다.
 * 프로필 수정은 닉네임·사진만 다루므로 태그 변경도 온보딩 수정 API가 담당한다.
 */
@Entity
@Table(name = "member_study_tags")
@IdClass(MemberStudyTagId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberStudyTag {

    @Id
    @Column(name = "member_id")
    private Long memberId;

    @Id
    @Column(name = "study_tag_id")
    private Long studyTagId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public MemberStudyTag(Long memberId, Long studyTagId) {
        this.memberId = memberId;
        this.studyTagId = studyTagId;
    }

    @PrePersist
    private void prePersist() {
        this.createdAt = LocalDateTime.now();
    }
}
