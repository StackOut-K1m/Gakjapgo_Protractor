package com.protractor.backend.domain.friendship.dto;

import java.time.LocalDateTime;

/**
 * Frontend action mapping: NONE -> request, OUTGOING -> pending indicator,
 * INCOMING -> accept/reject, ACCEPTED -> remove friend.
 */
public record FriendResponse(
        Long memberId,
        String nickname,
        String profileImageUrl,
        Long friendshipId,
        FriendRelationStatus relationshipStatus,
        LocalDateTime requestedAt,
        LocalDateTime respondedAt
) {
}
