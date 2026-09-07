package com.protractor.backend.domain.friendship.service;

import com.protractor.backend.domain.friendship.dto.FriendListResponse;
import com.protractor.backend.domain.friendship.dto.FriendRequestCreateRequest;
import com.protractor.backend.domain.friendship.dto.FriendResponse;
import com.protractor.backend.domain.friendship.entity.Friendship;
import com.protractor.backend.domain.friendship.entity.FriendshipStatus;
import com.protractor.backend.domain.friendship.repository.FriendshipRepository;
import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.global.exception.BusinessException;
import com.protractor.backend.global.websocket.RealtimeEventPublisher;
import com.protractor.backend.domain.notification.service.NotificationService;
import com.protractor.backend.domain.friendship.dto.FriendProfileResponse;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class FriendshipService {

    private final FriendshipRepository friendshipRepository;
    private final MemberRepository memberRepository;
    private final NotificationService notificationService;
    private final StudyRecordRepository studyRecordRepository;
    private final RealtimeEventPublisher realtimeEvents;

    @Transactional
    public Friendship createRequest(Long requesterMemberId, FriendRequestCreateRequest request) {
        Long addresseeMemberId = request.receiverId();
        if (requesterMemberId.equals(addresseeMemberId)) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "You cannot request friendship with yourself.");
        }
        getActiveMember(addresseeMemberId);

        Optional<Friendship> existing = friendshipRepository.findPair(requesterMemberId, addresseeMemberId);
        Friendship friendship = existing
                .map(value -> handleExistingRequest(value, requesterMemberId, addresseeMemberId))
                .orElseGet(() -> friendshipRepository.save(Friendship.builder()
                        .requesterMemberId(requesterMemberId)
                        .addresseeMemberId(addresseeMemberId)
                        .build()));
        if (friendship.getStatus() == FriendshipStatus.PENDING) {
            notificationService.friendshipRequest(addresseeMemberId, requesterMemberId, friendship.getId());
            realtimeEvents.friendship(addresseeMemberId, "REQUESTED", requesterMemberId, friendship.getId());
        } else if (existing.isPresent()) {
            realtimeEvents.friendship(friendship.getRequesterMemberId(), "ACCEPTED", requesterMemberId, friendship.getId());
        }
        return friendship;
    }

    @Transactional
    public Friendship acceptRequest(Long memberId, Long friendshipId) {
        Friendship friendship = getFriendship(friendshipId);
        if (!friendship.isAddressee(memberId) || friendship.getStatus() != FriendshipStatus.PENDING) {
            throw new BusinessException(HttpStatus.CONFLICT, "This friend request cannot be accepted.");
        }
        friendship.accept();
        realtimeEvents.friendship(friendship.getRequesterMemberId(), "ACCEPTED", memberId, friendship.getId());
        return friendship;
    }

    @Transactional
    public Friendship rejectRequest(Long memberId, Long friendshipId) {
        Friendship friendship = getFriendship(friendshipId);
        if (!friendship.isAddressee(memberId) || friendship.getStatus() != FriendshipStatus.PENDING) {
            throw new BusinessException(HttpStatus.CONFLICT, "This friend request cannot be rejected.");
        }
        friendship.reject();
        realtimeEvents.friendship(friendship.getRequesterMemberId(), "REJECTED", memberId, friendship.getId());
        return friendship;
    }

    public FriendListResponse getFriends(Long memberId, int page, int size) {
        return FriendListResponse.from(friendshipRepository.findAcceptedFriends(
                memberId, FriendshipStatus.ACCEPTED, PageRequest.of(page, size)));
    }

    public FriendListResponse getIncomingRequests(Long memberId, int page, int size) {
        return FriendListResponse.from(friendshipRepository.findIncomingPendingRequests(
                memberId, FriendshipStatus.PENDING, PageRequest.of(page, size)));
    }

    public FriendListResponse searchMembers(Long memberId, String keyword, int page, int size) {
        Page<FriendResponse> result = friendshipRepository.searchByNickname(
                memberId, keyword.trim(), PageRequest.of(page, size));
        return FriendListResponse.from(result);
    }

    public FriendProfileResponse getFriendProfile(Long memberId, Long friendMemberId) {
        Friendship friendship = friendshipRepository.findPair(memberId, friendMemberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Friendship not found."));
        if (friendship.getStatus() != FriendshipStatus.ACCEPTED) throw new BusinessException(HttpStatus.FORBIDDEN, "Friend profile is available only to accepted friends.");
        Member friend = getActiveMember(friendMemberId);
        LocalDateTime now = LocalDateTime.now();
        int total = studyRecordRepository.sumFocusedSecondsByMember(friendMemberId);
        int recent = studyRecordRepository.sumFocusedSecondsByMemberAndPeriod(
                friendMemberId, now.toLocalDate().minusDays(7), now.toLocalDate());
        Set<LocalDate> days = new HashSet<>();
        for (LocalDate studiedDate : studyRecordRepository.findStudiedDatesSince(
                friendMemberId, now.toLocalDate().minusDays(366))) days.add(studiedDate);
        int streak=0; for(LocalDate day=LocalDate.now(); days.contains(day); day=day.minusDays(1)) streak++;
        return FriendProfileResponse.of(friend,total,recent,streak);
    }

    @Transactional
    public void removeFriend(Long memberId, Long friendMemberId) {
        Friendship friendship = friendshipRepository.findPair(memberId, friendMemberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Friendship not found."));
        if (friendship.getStatus() != FriendshipStatus.ACCEPTED) {
            throw new BusinessException(HttpStatus.CONFLICT, "Only accepted friendships can be removed.");
        }
        friendshipRepository.delete(friendship);
        realtimeEvents.friendship(friendMemberId, "REMOVED", memberId, friendship.getId());
    }

    private Friendship handleExistingRequest(Friendship friendship, Long requesterMemberId, Long addresseeMemberId) {
        return switch (friendship.getStatus()) {
            case PENDING -> {
                if (friendship.isRequester(requesterMemberId)) {
                    throw new BusinessException(HttpStatus.CONFLICT, "A friend request is already pending.");
                }
                friendship.accept();
                yield friendship;
            }
            case ACCEPTED -> throw new BusinessException(HttpStatus.CONFLICT, "You are already friends.");
            case REJECTED -> {
                friendship.reRequest(requesterMemberId, addresseeMemberId);
                yield friendship;
            }
            case BLOCKED -> throw new BusinessException(HttpStatus.FORBIDDEN, "Friend request is blocked.");
        };
    }

    private Friendship getFriendship(Long friendshipId) {
        return friendshipRepository.findById(friendshipId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Friend request not found."));
    }

    private Member getActiveMember(Long memberId) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Member not found."));
        if (!member.isActive()) {
            throw new BusinessException(HttpStatus.NOT_FOUND, "Member not found.");
        }
        return member;
    }
}
