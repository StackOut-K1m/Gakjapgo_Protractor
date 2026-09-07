package com.protractor.backend.domain.friendship.repository;

import com.protractor.backend.domain.friendship.dto.FriendResponse;
import com.protractor.backend.domain.friendship.entity.Friendship;
import com.protractor.backend.domain.friendship.entity.FriendshipStatus;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    @Query("""
            select f from Friendship f
            where (f.requesterMemberId = :firstMemberId and f.addresseeMemberId = :secondMemberId)
               or (f.requesterMemberId = :secondMemberId and f.addresseeMemberId = :firstMemberId)
            """)
    Optional<Friendship> findPair(@Param("firstMemberId") Long firstMemberId,
                                  @Param("secondMemberId") Long secondMemberId);

    @Query(value = """
            select new com.protractor.backend.domain.friendship.dto.FriendResponse(
                m.id, m.nickname, m.profileImageUrl, f.id,
                com.protractor.backend.domain.friendship.dto.FriendRelationStatus.ACCEPTED,
                f.requestedAt, f.respondedAt)
            from Friendship f
            join Member m on (m.id = f.addresseeMemberId and f.requesterMemberId = :memberId)
                          or (m.id = f.requesterMemberId and f.addresseeMemberId = :memberId)
            where f.status = :status
              and (f.requesterMemberId = :memberId or f.addresseeMemberId = :memberId)
              and m.accountStatus = com.protractor.backend.domain.member.entity.AccountStatus.ACTIVE
              and m.deletedAt is null
            order by f.respondedAt desc, f.id desc
            """,
            countQuery = """
            select count(f) from Friendship f
            join Member m on (m.id = f.addresseeMemberId and f.requesterMemberId = :memberId)
                          or (m.id = f.requesterMemberId and f.addresseeMemberId = :memberId)
            where f.status = :status
              and (f.requesterMemberId = :memberId or f.addresseeMemberId = :memberId)
              and m.accountStatus = com.protractor.backend.domain.member.entity.AccountStatus.ACTIVE
              and m.deletedAt is null
            """)
    Page<FriendResponse> findAcceptedFriends(@Param("memberId") Long memberId,
                                             @Param("status") FriendshipStatus status,
                                             Pageable pageable);

    @Query(value = """
            select new com.protractor.backend.domain.friendship.dto.FriendResponse(
                m.id, m.nickname, m.profileImageUrl, f.id,
                com.protractor.backend.domain.friendship.dto.FriendRelationStatus.INCOMING,
                f.requestedAt, f.respondedAt)
            from Friendship f
            join Member m on m.id = f.requesterMemberId
            where f.addresseeMemberId = :memberId
              and f.status = :status
              and m.accountStatus = com.protractor.backend.domain.member.entity.AccountStatus.ACTIVE
              and m.deletedAt is null
            order by f.requestedAt desc, f.id desc
            """,
            countQuery = """
            select count(f) from Friendship f
            join Member m on m.id = f.requesterMemberId
            where f.addresseeMemberId = :memberId
              and f.status = :status
              and m.accountStatus = com.protractor.backend.domain.member.entity.AccountStatus.ACTIVE
              and m.deletedAt is null
            """)
    Page<FriendResponse> findIncomingPendingRequests(@Param("memberId") Long memberId,
                                                      @Param("status") FriendshipStatus status,
                                                      Pageable pageable);

    @Query(value = """
            select new com.protractor.backend.domain.friendship.dto.FriendResponse(
                m.id, m.nickname, m.profileImageUrl,
                case when f is null
                          or f.status = com.protractor.backend.domain.friendship.entity.FriendshipStatus.REJECTED
                          or f.status = com.protractor.backend.domain.friendship.entity.FriendshipStatus.BLOCKED
                         then null
                     else f.id end,
                case when f is null
                          or f.status = com.protractor.backend.domain.friendship.entity.FriendshipStatus.REJECTED
                          or f.status = com.protractor.backend.domain.friendship.entity.FriendshipStatus.BLOCKED
                         then com.protractor.backend.domain.friendship.dto.FriendRelationStatus.NONE
                     when f.status = com.protractor.backend.domain.friendship.entity.FriendshipStatus.ACCEPTED
                         then com.protractor.backend.domain.friendship.dto.FriendRelationStatus.ACCEPTED
                     when f.requesterMemberId = :memberId
                         then com.protractor.backend.domain.friendship.dto.FriendRelationStatus.OUTGOING
                     else com.protractor.backend.domain.friendship.dto.FriendRelationStatus.INCOMING end,
                f.requestedAt, f.respondedAt)
            from Member m
            left join Friendship f on (f.requesterMemberId = :memberId and f.addresseeMemberId = m.id)
                                  or (f.addresseeMemberId = :memberId and f.requesterMemberId = m.id)
            where m.id <> :memberId
              and m.accountStatus = com.protractor.backend.domain.member.entity.AccountStatus.ACTIVE
              and m.deletedAt is null
              and lower(m.nickname) like lower(concat('%', :keyword, '%'))
            order by m.nickname asc, m.id asc
            """,
            countQuery = """
            select count(m) from Member m
            where m.id <> :memberId
              and m.accountStatus = com.protractor.backend.domain.member.entity.AccountStatus.ACTIVE
              and m.deletedAt is null
              and lower(m.nickname) like lower(concat('%', :keyword, '%'))
            """)
    Page<FriendResponse> searchByNickname(@Param("memberId") Long memberId,
                                          @Param("keyword") String keyword,
                                          Pageable pageable);
}
