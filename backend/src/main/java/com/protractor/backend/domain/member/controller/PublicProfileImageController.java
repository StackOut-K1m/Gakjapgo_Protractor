package com.protractor.backend.domain.member.controller;

import com.protractor.backend.domain.member.service.ProfileImageStorage;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 프로필 사진 내려주기.
 *
 * <p>
 * 인증을 걸지 않는다. 이 주소는 &lt;img src&gt; 에 그대로 들어가는데, 브라우저가 그 요청에는
 * Authorization 헤더를 붙여 주지 않기 때문이다. 프로필 사진은 원래 같은 방에 있는 사람들에게
 * 보이라고 있는 것이라 공개해도 성격에 맞는다.
 *
 * <p>
 * 파일명이 서버가 만든 UUID라 주소만으로는 누구의 사진인지 알 수 없다 —
 * {@code /api/v1/public/**} 에 개인을 특정할 값을 두지 않는다는 규칙을 지키는 부분이다.
 */
@Tag(name = "Member", description = "회원 API")
@RestController
@RequestMapping("/api/v1/public/profile-images")
@RequiredArgsConstructor
public class PublicProfileImageController {

	private final ProfileImageStorage profileImageStorage;

	@Operation(summary = "프로필 사진 보기", description = "인증 없이 열린다. <img src>에 바로 쓴다.")
	@GetMapping("/{fileName}")
	public ResponseEntity<Resource> getProfileImage(@PathVariable String fileName) {
		Resource resource = profileImageStorage.load(fileName);
		return ResponseEntity.ok()
				// 브라우저가 확장자를 무시하고 내용을 넘겨짚지 못하게 막는다.
				.header("X-Content-Type-Options", "nosniff")
				// 파일명이 UUID라 사진을 바꾸면 주소도 바뀐다. 그래서 길게 캐시해도 안전하다.
				.cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
				.contentType(ProfileImageStorage.contentTypeOf(fileName))
				.body(resource);
	}
}
