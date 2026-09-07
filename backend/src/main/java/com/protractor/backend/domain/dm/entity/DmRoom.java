package com.protractor.backend.domain.dm.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity @Table(name = "dm_rooms") @Getter @NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DmRoom {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "dm_room_id") private Long id;
    @Column(name = "member_id_low", nullable = false) private Long memberIdLow;
    @Column(name = "member_id_high", nullable = false) private Long memberIdHigh;
    @Column(name = "created_at", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt;
    private DmRoom(Long memberIdLow, Long memberIdHigh) { this.memberIdLow = memberIdLow; this.memberIdHigh = memberIdHigh; }
    public static DmRoom of(Long firstMemberId, Long secondMemberId) { return new DmRoom(Math.min(firstMemberId, secondMemberId), Math.max(firstMemberId, secondMemberId)); }
    public boolean contains(Long memberId) { return memberIdLow.equals(memberId) || memberIdHigh.equals(memberId); }
    public Long counterpartOf(Long memberId) { return memberIdLow.equals(memberId) ? memberIdHigh : memberIdLow; }
    @PrePersist void create() { LocalDateTime now=LocalDateTime.now(); createdAt=now; updatedAt=now; }
    @PreUpdate void update() { updatedAt=LocalDateTime.now(); }
}
