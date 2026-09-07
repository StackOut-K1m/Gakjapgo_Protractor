package com.protractor.backend.domain.member.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 프로필 수정 요청(닉네임·프로필 사진뿐). null인 필드는 건드리지 않는다(부분 수정). */
public record MemberUpdateRequest(
        // 회원가입(SignupRequest)과 같은 규칙. @Pattern은 null이면 검사하지 않으므로 "미변경"이 허용된다.
        @Pattern(
                regexp = "^[가-힣A-Za-z0-9]{2,16}$",
                message = "닉네임은 한글(완성형)·영문·숫자만 사용해 2자 이상 16자 이하여야 합니다."
        )
        String nickname,

        // 업로드는 별도 파일 API 몫이고, 여기는 업로드가 끝난 URL만 받는다. 빈 문자열은 "사진 제거"다.
        @Size(max = 1000, message = "프로필 사진 URL은 1000자 이하여야 합니다.")
        String profileImageUrl
) {
    public boolean hasNoChanges() {
        return nickname == null && profileImageUrl == null;
    }
}
