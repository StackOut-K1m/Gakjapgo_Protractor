package com.protractor.backend.domain.member.dto;

import com.protractor.backend.domain.member.entity.Member;
import java.time.LocalDateTime;

public record MemberResponse(
        Long memberId,
        String email,
        String nickname,
        String profileImageUrl,
        // LOCAL / KAKAO / GOOGLE. FE가 소셜 계정 분기(탈퇴 화면의 비밀번호 입력 숨김 등)에 쓴다.
        String provider,
        String role,
        String accountStatus,
        // 마이페이지 프로필 카드의 "가입일" 표시용.
        LocalDateTime createdAt
) {
    public static MemberResponse from(Member member) {
        return new MemberResponse(
                member.getId(),
                member.getEmail(),
                member.getNickname(),
                member.getProfileImageUrl(),
                member.getProvider().name(),
                member.getRole().name(),
                member.getAccountStatus().name(),
                member.getCreatedAt()
        );
    }
}
