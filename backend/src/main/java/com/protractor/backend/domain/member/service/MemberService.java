package com.protractor.backend.domain.member.service;

import com.protractor.backend.domain.auth.repository.RefreshTokenRepository;
import com.protractor.backend.domain.member.dto.MemberResponse;
import com.protractor.backend.domain.member.dto.MemberUpdateRequest;
import com.protractor.backend.domain.member.dto.MemberUpdateResponse;
import com.protractor.backend.domain.member.dto.WithdrawRequest;
import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.global.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenRepository refreshTokenRepository;
    private final ProfileImageStorage profileImageStorage;

    public MemberResponse getMyInfo(Long memberId) {
        return memberRepository.findById(memberId)
                .map(MemberResponse::from)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다."));
    }

    /**
     * 프로필 수정(닉네임·프로필 사진 URL). null인 필드는 건드리지 않는다(부분 수정).
     * 관심 태그 변경은 프로필이 아니라 온보딩 수정(PATCH /onboarding/me)이 담당한다.
     */
    @Transactional
    public MemberUpdateResponse updateProfile(Long memberId, MemberUpdateRequest request) {
        if (request.hasNoChanges()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "수정할 내용이 없습니다.");
        }

        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다."));

        if (request.nickname() != null) {
            member.changeNickname(request.nickname());
        }
        if (request.profileImageUrl() != null) {
            // 빈 문자열은 "사진 제거"로 취급한다.
            String url = request.profileImageUrl().isBlank() ? null : request.profileImageUrl().trim();
            member.changeProfileImageUrl(url);
        }

        // updatedAt(@PreUpdate)은 flush 시점에 채워지므로, 응답에 새 값을 담으려면 여기서 flush를 강제한다.
        memberRepository.saveAndFlush(member);
        return MemberUpdateResponse.from(member);
    }

    /**
     * 프로필 사진 올리기. 파일을 저장하고 회원의 사진 주소를 새 주소로 바꾼다.
     *
     * <p>
     * 예전 사진은 DB를 바꾼 뒤에 지운다. 순서를 바꾸면 저장에 실패했을 때 이미 지운 파일을 되돌릴
     * 수 없어, 화면에는 사진이 있는데 파일은 없는 상태가 된다.
     */
    @Transactional
    public MemberUpdateResponse updateProfileImage(Long memberId, MultipartFile file) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다."));

        String previousUrl = member.getProfileImageUrl();
        member.changeProfileImageUrl(profileImageStorage.store(file));
        memberRepository.saveAndFlush(member);

        profileImageStorage.deleteQuietly(previousUrl);
        return MemberUpdateResponse.from(member);
    }

    /** 프로필 사진 지우기. 기본 이미지로 돌아간다. */
    @Transactional
    public MemberUpdateResponse deleteProfileImage(Long memberId) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다."));

        String previousUrl = member.getProfileImageUrl();
        member.changeProfileImageUrl(null);
        memberRepository.saveAndFlush(member);

        profileImageStorage.deleteQuietly(previousUrl);
        return MemberUpdateResponse.from(member);
    }

    /**
     * 회원 탈퇴(소프트 삭제). 일반 계정은 비밀번호로 본인을 확인하고, 소셜 계정은 비밀번호가 없어
     * 토큰 인증만으로 진행한다. 탈퇴 즉시 refresh 토큰을 지워 다른 기기의 세션도 끊는다.
     * (남아 있는 access 토큰은 JwtAuthenticationFilter의 계정 상태 확인이 차단한다)
     */
    @Transactional
    public void withdraw(Long memberId, WithdrawRequest request) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다."));

        if (!member.isActive()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "이미 탈퇴했거나 이용할 수 없는 계정입니다.");
        }

        if (!member.isSocial()) {
            String passwordConfirm = request == null ? null : request.passwordConfirm();
            if (!StringUtils.hasText(passwordConfirm)
                    || !passwordEncoder.matches(passwordConfirm, member.getPassword())) {
                throw new BusinessException(HttpStatus.BAD_REQUEST, "비밀번호가 올바르지 않습니다.");
            }
        }

        member.withdraw();
        refreshTokenRepository.delete(memberId);
    }
}
