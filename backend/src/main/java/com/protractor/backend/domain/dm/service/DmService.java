package com.protractor.backend.domain.dm.service;

import com.protractor.backend.domain.dm.dto.DmDtos.MessageListResponse;
import com.protractor.backend.domain.dm.dto.DmDtos.MessageResponse;
import com.protractor.backend.domain.dm.dto.DmDtos.OpenRequest;
import com.protractor.backend.domain.dm.dto.DmDtos.RoomResponse;
import com.protractor.backend.domain.dm.dto.DmDtos.SendRequest;
import com.protractor.backend.domain.dm.entity.DmMessage;
import com.protractor.backend.domain.dm.entity.DmRoom;
import com.protractor.backend.domain.dm.repository.DmMessageRepository;
import com.protractor.backend.domain.dm.repository.DmRoomRepository;
import com.protractor.backend.domain.friendship.entity.FriendshipStatus;
import com.protractor.backend.domain.friendship.repository.FriendshipRepository;
import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.domain.notification.service.NotificationService;
import com.protractor.backend.global.exception.BusinessException;
import com.protractor.backend.global.websocket.RealtimeEventPublisher;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DmService {
    private final DmRoomRepository rooms;
    private final DmMessageRepository messages;
    private final FriendshipRepository friendships;
    private final MemberRepository members;
    private final NotificationService notifications;
    private final RealtimeEventPublisher realtimeEvents;

    @Transactional
    public RoomResponse open(Long me, OpenRequest request) {
        Long other = request.memberId();
        requireFriend(me, other);
        DmRoom room = rooms.findByMemberIdLowAndMemberIdHigh(Math.min(me, other), Math.max(me, other))
                .orElseGet(() -> rooms.save(DmRoom.of(me, other)));
        return roomResponse(me, room);
    }

    public List<RoomResponse> list(Long me) {
        return rooms.findByMemberIdLowOrMemberIdHigh(me, me).stream()
                .filter(room -> isFriend(me, room.counterpartOf(me)))
                .map(room -> roomResponse(me, room))
                .toList();
    }

    @Transactional
    public MessageResponse send(Long me, Long roomId, SendRequest request) {
        DmRoom room = requireRoom(me, roomId);
        Long other = room.counterpartOf(me);
        requireFriend(me, other);
        String content = request.content() == null ? "" : request.content().trim();
        if (content.isEmpty() || content.length() > 2000) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "Message content must be 1 to 2000 characters.");
        }

        boolean hasUnread = messages.existsByDmRoomIdAndSenderMemberIdNotAndReadAtIsNull(roomId, me);
        DmMessage message = messages.save(DmMessage.of(roomId, me, content));
        MessageResponse response = MessageResponse.from(message);
        if (!hasUnread) {
            notifications.dmMessage(other, me, roomId, content);
        }
        realtimeEvents.dm(other, roomId, response);
        return response;
    }

    @Transactional
    public MessageListResponse getMessages(Long me, Long roomId, int page, int size) {
        DmRoom room = requireRoom(me, roomId);
        requireFriend(me, room.counterpartOf(me));
        messages.markUnreadReceivedAsRead(roomId, me);
        return MessageListResponse.from(messages.findByDmRoomIdOrderByCreatedAtDescIdDesc(roomId, PageRequest.of(page, size)));
    }

    @Transactional
    public void markRead(Long me, Long roomId) {
        DmRoom room = requireRoom(me, roomId);
        requireFriend(me, room.counterpartOf(me));
        messages.markUnreadReceivedAsRead(roomId, me);
    }

    private DmRoom requireRoom(Long me, Long roomId) {
        DmRoom room = rooms.findById(roomId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "DM room not found."));
        if (!room.contains(me)) {
            throw new BusinessException(HttpStatus.NOT_FOUND, "DM room not found.");
        }
        return room;
    }

    private void requireFriend(Long first, Long second) {
        if (!isFriend(first, second)) {
            throw new BusinessException(HttpStatus.FORBIDDEN, "DM is available only to accepted friends.");
        }
    }

    private boolean isFriend(Long first, Long second) {
        return friendships.findPair(first, second)
                .map(friendship -> friendship.getStatus() == FriendshipStatus.ACCEPTED)
                .orElse(false);
    }

    private RoomResponse roomResponse(Long me, DmRoom room) {
        Long other = room.counterpartOf(me);
        Member member = members.findById(other)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "Member not found."));
        DmMessage last = messages.findFirstByDmRoomIdOrderByCreatedAtDescIdDesc(room.getId()).orElse(null);
        long unreadCount = messages.countByDmRoomIdAndSenderMemberIdNotAndReadAtIsNull(room.getId(), me);
        return new RoomResponse(room.getId(), other, member.getNickname(), member.getProfileImageUrl(),
                last == null ? null : last.getContent(), last == null ? null : last.getCreatedAt(), unreadCount);
    }
}
