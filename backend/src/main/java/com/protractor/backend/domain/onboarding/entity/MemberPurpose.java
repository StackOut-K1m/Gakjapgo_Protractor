package com.protractor.backend.domain.onboarding.entity;

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
 * 회원이 고른 공부 목적(온보딩 1단계, 다중 선택). 회원당 목적 수만큼 한 줄씩 저장한다.
 *
 * <p>
 * 목적 선택지는 study_tags 이름과 같은 고정 목록이라 별도 참조 테이블 없이 문자열을 그대로 담는다.
 * 수정은 태그와 같은 "통째 교체(삭제 후 재삽입)" 방식이다.
 */
@Entity
@Table(name = "member_purposes")
@IdClass(MemberPurposeId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberPurpose {

    @Id
    @Column(name = "member_id")
    private Long memberId;

    @Id
    @Column(name = "purpose", length = 50)
    private String purpose;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public MemberPurpose(Long memberId, String purpose) {
        this.memberId = memberId;
        this.purpose = purpose;
    }

    @PrePersist
    private void prePersist() {
        this.createdAt = LocalDateTime.now();
    }
}
