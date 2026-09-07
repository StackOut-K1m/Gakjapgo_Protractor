package com.protractor.backend.domain.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SignupRequest(
        @NotBlank(message = "이메일은 필수입니다.")
        @Size(max = 100, message = "이메일은 100자 이하여야 합니다.")
        @Pattern(
                regexp = "^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}$",
                message = "이메일 형식이 올바르지 않습니다."
        )
        String email,

        @NotBlank(message = "비밀번호는 필수입니다.")
        @Pattern(
                regexp = "^(?=.*[A-Za-z])(?=.*\\d)[A-Za-z\\d!@#$%^&*()_+\\-=\\[\\]{};':\",.<>/?~`|\\\\]{8,64}$",
                message = "비밀번호는 영문과 숫자를 포함해 8자 이상 64자 이하여야 합니다."
        )
        String password,

        @NotBlank(message = "비밀번호 확인은 필수입니다.")
        String passwordConfirm,

        @NotBlank(message = "닉네임은 필수입니다.")
        @Pattern(
                regexp = "^[가-힣A-Za-z0-9]{2,16}$",
                message = "닉네임은 한글(완성형)·영문·숫자만 사용해 2자 이상 16자 이하여야 합니다."
        )
        String nickname
) {
}
