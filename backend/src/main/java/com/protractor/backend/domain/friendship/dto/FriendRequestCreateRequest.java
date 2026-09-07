package com.protractor.backend.domain.friendship.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record FriendRequestCreateRequest(
        @NotNull(message = "receiverId is required.")
        @Positive(message = "receiverId must be positive.")
        Long receiverId
) {
}
