package com.protractor.backend.domain.notification.repository;

import com.protractor.backend.domain.notification.entity.Notification;
import com.protractor.backend.domain.notification.entity.NotificationType;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    Page<Notification> findByReceiverMemberId(Long receiverMemberId, Pageable pageable);

    /** 미읽음(read_at IS NULL)만. unreadOnly=true 목록과 종 아이콘 배지 개수(totalElements)에 쓴다. */
    Page<Notification> findByReceiverMemberIdAndReadAtIsNull(Long receiverMemberId, Pageable pageable);

    /** 본인 소유 확인을 겸한 단건 조회. 남의 알림은 결과가 비어 404로 처리한다. */
    Optional<Notification> findByIdAndReceiverMemberId(Long id, Long receiverMemberId);

    @Modifying
    @Query("""
            update Notification n
            set n.readAt = CURRENT_TIMESTAMP
            where n.receiverMemberId = :memberId
              and n.readAt is null
            """)
    int markAllUnreadAsRead(@Param("memberId") Long memberId);

    @Modifying
    @Query("""
            delete from Notification n
            where n.receiverMemberId = :memberId
              and n.readAt is not null
            """)
    int deleteAllReadByReceiverMemberId(@Param("memberId") Long memberId);

    /**
     * 이번 주에 이미 같은 종류의 알림을 받은 수신자들. 중복 발송 방지 키(수신자+type+대상 주차)를
     * 테이블 제약 없이 조회로 구현한 것이다 — 발송이 매주 월요일 1회뿐이라 "이번 주 발송분 존재 여부"가
     * 곧 그 주차의 중복 여부다. (유니크 제약을 걸려면 DDL 변경이라 DB 담당 협의 대상)
     */
    @Query("""
            select n.receiverMemberId
            from Notification n
            where n.type = :type
                and n.createdAt >= :since
                and n.receiverMemberId in :receiverIds
            """)
    List<Long> findReceiverIdsNotifiedSince(@Param("type") NotificationType type,
            @Param("since") LocalDateTime since,
            @Param("receiverIds") Collection<Long> receiverIds);
}
