package com.protractor.backend.domain.auth.dto;

import com.protractor.backend.domain.member.entity.Member;

public record LoginResponse(
        String accessToken,
        String refreshToken,
        MemberSummary member
) {
    public record MemberSummary(
            Long memberId,
            String nickname,
            String email,
            String profileImageUrl,
            // MEMBER / ADMIN. FE가 게시판의 공지·이벤트 작성 버튼 노출 판단에 쓴다.
            String role
    ) {
        public static MemberSummary from(Member member) {
            return new MemberSummary(
                    member.getId(),
                    member.getNickname(),
                    member.getEmail(),
                    member.getProfileImageUrl(),
                    member.getRole().name()
            );
        }
    }

    public static LoginResponse of(String accessToken, String refreshToken, Member member) {
        return new LoginResponse(accessToken, refreshToken, MemberSummary.from(member));
    }
}
