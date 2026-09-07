package com.protractor.backend.domain.member.dto;

import com.protractor.backend.domain.member.entity.Member;
import java.time.LocalDateTime;

public record MemberUpdateResponse(
        Long memberId,
        String nickname,
        String profileImageUrl,
        LocalDateTime updatedAt
) {
    public static MemberUpdateResponse from(Member member) {
        return new MemberUpdateResponse(
                member.getId(),
                member.getNickname(),
                member.getProfileImageUrl(),
                member.getUpdatedAt()
        );
    }
}
