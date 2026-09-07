package com.protractor.backend.domain.friendship.entity;

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
@Table(name = "friendships")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Friendship {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "friendship_id")
    private Long id;

    @Column(name = "requester_member_id", nullable = false)
    private Long requesterMemberId;

    @Column(name = "addressee_member_id", nullable = false)
    private Long addresseeMemberId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private FriendshipStatus status;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @Column(name = "responded_at")
    private LocalDateTime respondedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private Friendship(Long requesterMemberId, Long addresseeMemberId) {
        this.requesterMemberId = requesterMemberId;
        this.addresseeMemberId = addresseeMemberId;
        this.status = FriendshipStatus.PENDING;
    }

    public boolean isRequester(Long memberId) {
        return requesterMemberId.equals(memberId);
    }

    public boolean isAddressee(Long memberId) {
        return addresseeMemberId.equals(memberId);
    }

    public void accept() {
        this.status = FriendshipStatus.ACCEPTED;
        this.respondedAt = LocalDateTime.now();
    }

    public void reject() {
        this.status = FriendshipStatus.REJECTED;
        this.respondedAt = LocalDateTime.now();
    }

    public void reRequest(Long requesterMemberId, Long addresseeMemberId) {
        this.requesterMemberId = requesterMemberId;
        this.addresseeMemberId = addresseeMemberId;
        this.status = FriendshipStatus.PENDING;
        this.requestedAt = LocalDateTime.now();
        this.respondedAt = null;
    }

    @PrePersist
    private void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        this.requestedAt = now;
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    private void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
