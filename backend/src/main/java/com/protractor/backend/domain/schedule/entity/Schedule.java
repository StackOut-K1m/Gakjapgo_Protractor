package com.protractor.backend.domain.schedule.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 개인 일정(캘린더). 본인만 조회·수정·삭제할 수 있다.
 *
 * <p>
 * 디데이(dDayEnabled) 일정은 홈 대시보드의 D-Day 표시가 이 테이블을 읽어 쓴다.
 * 여러 개가 켜져 있으면 어떤 것을 보여줄지는 홈 담당(가장 가까운 날짜 등)이 정한다.
 */
@Entity
@Table(name = "schedules")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Schedule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "schedule_id")
    private Long id;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "target_date", nullable = false)
    private LocalDate targetDate;

    /** 캘린더 표시 색상. 형식(#16A34A 등)은 FE가 정하며 서버는 문자열로만 보관한다. */
    @Column(name = "color", length = 20)
    private String color;

    @Column(name = "d_day_enabled", nullable = false)
    private boolean dDayEnabled;

    @Column(name = "memo", length = 500)
    private String memo;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private Schedule(Long memberId, String title, LocalDate targetDate, String color,
                     boolean dDayEnabled, String memo) {
        this.memberId = memberId;
        this.title = title;
        this.targetDate = targetDate;
        this.color = color;
        this.dDayEnabled = dDayEnabled;
        this.memo = memo;
    }

    public boolean isOwnedBy(Long memberId) {
        return this.memberId.equals(memberId);
    }

    public void changeTitle(String title) {
        this.title = title;
    }

    public void changeTargetDate(LocalDate targetDate) {
        this.targetDate = targetDate;
    }

    /** null이면 색상 제거다. */
    public void changeColor(String color) {
        this.color = color;
    }

    public void changeDDayEnabled(boolean dDayEnabled) {
        this.dDayEnabled = dDayEnabled;
    }

    /** null이면 메모 제거다. */
    public void changeMemo(String memo) {
        this.memo = memo;
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
