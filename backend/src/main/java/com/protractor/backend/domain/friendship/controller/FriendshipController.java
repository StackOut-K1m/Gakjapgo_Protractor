package com.protractor.backend.domain.friendship.controller;

import com.protractor.backend.domain.friendship.dto.FriendListResponse;
import com.protractor.backend.domain.friendship.dto.FriendRequestCreateRequest;
import com.protractor.backend.domain.friendship.dto.FriendRequestResponse;
import com.protractor.backend.domain.friendship.dto.FriendProfileResponse;
import com.protractor.backend.domain.friendship.entity.Friendship;
import com.protractor.backend.domain.friendship.service.FriendshipService;
import com.protractor.backend.domain.member.dto.MessageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Friendship", description = "Friend request and list APIs")
@RestController
@RequestMapping("/api/v1/friends")
@RequiredArgsConstructor
@Validated
public class FriendshipController {

    private final FriendshipService friendshipService;

    @Operation(summary = "Get accepted friends")
    @GetMapping
    public ResponseEntity<FriendListResponse> getFriends(
            Authentication authentication,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size
    ) {
        return ResponseEntity.ok(friendshipService.getFriends(memberId(authentication), page, size));
    }

    /**
     * Returns pending requests received by the authenticated member.
     * Every result has relationshipStatus=INCOMING and its friendshipId is used to accept or reject it.
     */
    @Operation(summary = "Get incoming pending friend requests")
    @GetMapping("/requests")
    public ResponseEntity<FriendListResponse> getIncomingRequests(
            Authentication authentication,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size
    ) {
        return ResponseEntity.ok(friendshipService.getIncomingRequests(memberId(authentication), page, size));
    }

    /**
     * Frontend must use relationshipStatus to choose the action:
     * NONE=request, OUTGOING=show pending, INCOMING=accept/reject, ACCEPTED=remove.
     */
    @Operation(summary = "Search members by nickname with relationship status")
    @GetMapping("/search")
    public ResponseEntity<FriendListResponse> searchMembers(
            Authentication authentication,
            @RequestParam String keyword,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size
    ) {
        return ResponseEntity.ok(friendshipService.searchMembers(memberId(authentication), keyword, page, size));
    }

    @Operation(summary = "Create a friend request; reciprocal pending request is accepted immediately")
    @PostMapping("/requests")
    public ResponseEntity<FriendRequestResponse> createRequest(
            Authentication authentication,
            @Valid @RequestBody FriendRequestCreateRequest request
    ) {
        Friendship friendship = friendshipService.createRequest(memberId(authentication), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(FriendRequestResponse.from(friendship));
    }

    @Operation(summary = "Accept a pending friend request")
    @PostMapping("/requests/{friendshipId}/accept")
    public ResponseEntity<FriendRequestResponse> acceptRequest(Authentication authentication, @PathVariable Long friendshipId) {
        return ResponseEntity.ok(FriendRequestResponse.from(
                friendshipService.acceptRequest(memberId(authentication), friendshipId)));
    }

    @Operation(summary = "Reject a pending friend request")
    @PostMapping("/requests/{friendshipId}/reject")
    public ResponseEntity<FriendRequestResponse> rejectRequest(Authentication authentication, @PathVariable Long friendshipId) {
        return ResponseEntity.ok(FriendRequestResponse.from(
                friendshipService.rejectRequest(memberId(authentication), friendshipId)));
    }

    @Operation(summary = "Remove an accepted friendship")
    @DeleteMapping("/{memberId}")
    public ResponseEntity<MessageResponse> removeFriend(Authentication authentication, @PathVariable Long memberId) {
        friendshipService.removeFriend(memberId(authentication), memberId);
        return ResponseEntity.ok(new MessageResponse("Friendship removed."));
    }

    @Operation(summary = "Get an accepted friend's profile and study summary")
    @GetMapping("/{memberId}/profile")
    public ResponseEntity<FriendProfileResponse> getFriendProfile(Authentication authentication, @PathVariable Long memberId) {
        return ResponseEntity.ok(friendshipService.getFriendProfile(memberId(authentication), memberId));
    }

    private Long memberId(Authentication authentication) {
        return (Long) authentication.getPrincipal();
    }
}
