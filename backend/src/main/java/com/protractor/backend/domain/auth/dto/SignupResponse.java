package com.protractor.backend.domain.auth.dto;

import com.protractor.backend.domain.member.entity.Member;
import java.time.LocalDateTime;

public record SignupResponse(
        Long memberId,
        String email,
        String nickname,
        LocalDateTime createdAt
) {
    public static SignupResponse from(Member member) {
        return new SignupResponse(
                member.getId(),
                member.getEmail(),
                member.getNickname(),
                member.getCreatedAt()
        );
    }
}
