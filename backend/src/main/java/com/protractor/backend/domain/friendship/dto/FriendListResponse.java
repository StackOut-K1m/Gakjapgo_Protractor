package com.protractor.backend.domain.friendship.dto;

import java.util.List;
import org.springframework.data.domain.Page;

public record FriendListResponse(List<FriendResponse> friends, PageInfo page) {
    public record PageInfo(int page, int size, long totalElements, int totalPages) {
    }

    public static FriendListResponse from(Page<FriendResponse> result) {
        return new FriendListResponse(result.getContent(), new PageInfo(
                result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages()));
    }
}
