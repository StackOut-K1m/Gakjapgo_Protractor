package com.protractor.backend.domain.friendship.dto;

import com.protractor.backend.domain.friendship.entity.Friendship;
import java.time.LocalDateTime;

public record FriendRequestResponse(Long requestId, String status, LocalDateTime respondedAt) {
    public static FriendRequestResponse from(Friendship friendship) {
        return new FriendRequestResponse(
                friendship.getId(), friendship.getStatus().name(), friendship.getRespondedAt());
    }
}
