package com.protractor.backend.domain.member.dto;

/** 회원 탈퇴 요청. 일반 계정만 비밀번호 확인이 필요하고, 소셜 계정은 본문 없이 호출한다. */
public record WithdrawRequest(
        String passwordConfirm
) {
}
