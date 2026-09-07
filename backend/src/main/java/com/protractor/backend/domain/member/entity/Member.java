package com.protractor.backend.domain.member.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "members")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "member_id")
    private Long id;

    // 소셜 가입자는 email(미동의 시)과 password가 없을 수 있다. 스키마도 NULL 허용.
    @Column(name = "email", unique = true, length = 100)
    private String email;

    @Column(name = "password", length = 255)
    private String password;

    @Column(name = "nickname", nullable = false, length = 50)
    private String nickname;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 20)
    private Provider provider;

    @Column(name = "provider_id", length = 100)
    private String providerId;

    @Column(name = "profile_image_url", length = 1000)
    private String profileImageUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(name = "account_status", nullable = false, length = 30)
    private AccountStatus accountStatus;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private Member(String email, String password, String nickname, String profileImageUrl,
                   Provider provider, String providerId) {
        this.email = email;
        this.password = password;
        this.nickname = nickname;
        this.profileImageUrl = profileImageUrl;
        this.provider = provider == null ? Provider.LOCAL : provider;
        this.providerId = providerId;
        this.role = Role.MEMBER;
        this.accountStatus = AccountStatus.ACTIVE;
    }

    public boolean isSocial() {
        return this.provider != Provider.LOCAL;
    }

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

    public boolean isActive() {
        return this.accountStatus == AccountStatus.ACTIVE && this.deletedAt == null;
    }

    // 인코딩된 비밀번호만 받는다. 평문 인코딩은 서비스 계층(PasswordEncoder) 책임.
    public void changePassword(String encodedPassword) {
        this.password = encodedPassword;
    }

    // 형식 검증(2~16자, 한글·영문·숫자)은 요청 DTO가 한다.
    public void changeNickname(String nickname) {
        this.nickname = nickname;
    }

    /** 프로필 사진 변경. null이면 사진 제거다. */
    public void changeProfileImageUrl(String profileImageUrl) {
        this.profileImageUrl = profileImageUrl;
    }

    /**
     * 탈퇴(소프트 삭제). 공부 기록·게시글이 참조하므로 행은 남긴다.
     *
     * <p>
     * 개인 식별자(이메일·비밀번호·소셜 ID·프로필 사진)는 즉시 비운다 — 개인정보를 파기하는 동시에,
     * 유니크 제약 점유가 풀려 같은 이메일/소셜 계정으로 새 회원 가입이 가능해진다(재가입 허용 정책).
     * 닉네임은 남은 기록의 표시용으로 유지한다.
     */
    public void withdraw() {
        this.accountStatus = AccountStatus.WITHDRAWN;
        this.deletedAt = LocalDateTime.now();
        this.email = null;
        this.password = null;
        this.providerId = null;
        this.profileImageUrl = null;
    }
}
