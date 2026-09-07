package com.protractor.backend.domain.member.controller;

import com.protractor.backend.domain.member.dto.MemberResponse;
import com.protractor.backend.domain.member.dto.MemberUpdateRequest;
import com.protractor.backend.domain.member.dto.MemberUpdateResponse;
import com.protractor.backend.domain.member.dto.MessageResponse;
import com.protractor.backend.domain.member.dto.WithdrawRequest;
import com.protractor.backend.domain.member.service.MemberService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Tag(name = "Member", description = "회원 API")
@RestController
@RequestMapping("/api/v1/members")
@RequiredArgsConstructor
public class MemberController {

    private final MemberService memberService;

    @Operation(summary = "내 정보 조회")
    @GetMapping("/me")
    public ResponseEntity<MemberResponse> getMyInfo(Authentication authentication) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(memberService.getMyInfo(memberId));
    }

    @Operation(summary = "내 프로필 수정 (보낸 필드만 반영: 닉네임/프로필 사진 URL)")
    @PatchMapping("/me")
    public ResponseEntity<MemberUpdateResponse> updateProfile(
            Authentication authentication,
            @Valid @RequestBody MemberUpdateRequest request
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(memberService.updateProfile(memberId, request));
    }

    @Operation(summary = "프로필 사진 업로드", description = "multipart 'file' 파트로 한 장. "
            + "jpg/png/webp/gif, 5MB 이하. 올리면 예전 사진은 서버에서 지운다. "
            + "응답의 profileImageUrl을 그대로 <img src>에 쓰면 된다.")
    @PostMapping("/me/profile-image")
    public ResponseEntity<MemberUpdateResponse> uploadProfileImage(
            Authentication authentication,
            @RequestPart("file") MultipartFile file
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(memberService.updateProfileImage(memberId, file));
    }

    @Operation(summary = "프로필 사진 제거", description = "기본 이미지로 돌아간다.")
    @DeleteMapping("/me/profile-image")
    public ResponseEntity<MemberUpdateResponse> deleteProfileImage(Authentication authentication) {
        Long memberId = (Long) authentication.getPrincipal();
        return ResponseEntity.ok(memberService.deleteProfileImage(memberId));
    }

    @Operation(summary = "회원 탈퇴 (일반 계정은 비밀번호 확인, 소셜 계정은 본문 없이 호출)")
    @DeleteMapping("/me")
    public ResponseEntity<MessageResponse> withdraw(
            Authentication authentication,
            @RequestBody(required = false) WithdrawRequest request
    ) {
        Long memberId = (Long) authentication.getPrincipal();
        memberService.withdraw(memberId, request);
        return ResponseEntity.ok(new MessageResponse("회원 탈퇴가 완료되었습니다."));
    }
}
