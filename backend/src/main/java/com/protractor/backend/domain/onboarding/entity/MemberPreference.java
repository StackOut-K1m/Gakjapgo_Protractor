package com.protractor.backend.domain.onboarding.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 회원의 온보딩 정보(학습 목표·AI 감지 동의). member_id가 그대로 PK라 회원당 1행이다.
 *
 * <p>
 * 공부 목적은 다중 선택이라 member_purposes 테이블에 따로 저장한다. 이 테이블의
 * study_purpose(단수) 컬럼은 그 결정으로 더 이상 쓰지 않아 매핑하지 않는다.
 *
 * <p>
 * onboarding_completed_at이 null이 아니면 온보딩을 마친 회원이다. 동의 항목은 법적 근거가 되는 값이라
 * 변경 시각(consent_updated_at)을 따로 남긴다.
 */
@Entity
@Table(name = "member_preferences")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberPreference {

    @Id
    @Column(name = "member_id")
    private Long memberId;

    @Column(name = "goal_text", length = 255)
    private String goalText;

    /** 하루 목표 학습 시간(분). 주간 목표 표시는 이 값 × 7로 계산한다. null이면 미설정. */
    @Column(name = "goal_minutes")
    private Integer goalMinutes;

    @Column(name = "posture_detection_consent", nullable = false)
    private boolean postureDetectionConsent;

    @Column(name = "drowsiness_detection_consent", nullable = false)
    private boolean drowsinessDetectionConsent;

    @Column(name = "posture_capture_consent", nullable = false)
    private boolean postureCaptureConsent;

    @Column(name = "consent_updated_at")
    private LocalDateTime consentUpdatedAt;

    @Column(name = "onboarding_completed_at")
    private LocalDateTime onboardingCompletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private MemberPreference(Long memberId, String goalText, Integer goalMinutes,
                             boolean postureDetectionConsent, boolean drowsinessDetectionConsent,
                             boolean postureCaptureConsent) {
        this.memberId = memberId;
        this.goalText = goalText;
        this.goalMinutes = goalMinutes;
        this.postureDetectionConsent = postureDetectionConsent;
        this.drowsinessDetectionConsent = drowsinessDetectionConsent;
        this.postureCaptureConsent = postureCaptureConsent;
        LocalDateTime now = LocalDateTime.now();
        this.consentUpdatedAt = now;
        this.onboardingCompletedAt = now;
    }

    /**
     * 온보딩 완료 처리. 다른 기능(AI 동의 등)이 이 행을 먼저 만들어 둔 경우를 위해
     * 새로 만들지 않고 기존 행을 채우는 경로다.
     */
    public void completeOnboarding(String goalText, Integer goalMinutes,
                                   boolean postureDetectionConsent, boolean drowsinessDetectionConsent,
                                   boolean postureCaptureConsent) {
        this.goalText = goalText;
        this.goalMinutes = goalMinutes;
        this.postureDetectionConsent = postureDetectionConsent;
        this.drowsinessDetectionConsent = drowsinessDetectionConsent;
        this.postureCaptureConsent = postureCaptureConsent;
        LocalDateTime now = LocalDateTime.now();
        this.consentUpdatedAt = now;
        this.onboardingCompletedAt = now;
    }

    public boolean isOnboardingCompleted() {
        return this.onboardingCompletedAt != null;
    }

    public void changeGoalText(String goalText) {
        this.goalText = goalText;
    }

    /** 목표 학습 시간 변경. null이면 목표 해제다. */
    public void changeGoalMinutes(Integer goalMinutes) {
        this.goalMinutes = goalMinutes;
    }

    /** 동의 변경(철회 포함). 동의는 법적 근거가 되는 값이라 변경 시각을 함께 남긴다. */
    public void changeConsents(boolean postureDetectionConsent, boolean drowsinessDetectionConsent,
                               boolean postureCaptureConsent) {
        this.postureDetectionConsent = postureDetectionConsent;
        this.drowsinessDetectionConsent = drowsinessDetectionConsent;
        this.postureCaptureConsent = postureCaptureConsent;
        this.consentUpdatedAt = LocalDateTime.now();
    }

    /** 태그만 바뀌어 이 행의 필드가 그대로일 때도 수정 시각이 갱신되도록 명시적으로 남긴다. */
    public void markUpdated() {
        this.updatedAt = LocalDateTime.now();
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
}
