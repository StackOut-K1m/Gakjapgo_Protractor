package com.protractor.backend.domain.member.service;

import com.protractor.backend.global.exception.BusinessException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * 프로필 사진의 실제 저장/읽기. 게시글 첨부(PostAttachmentStorage)와 같은 방식이다.
 *
 * <p>
 * 저장 파일명은 서버가 만든 UUID(+확장자)만 쓴다. 사용자가 보낸 원본 이름을 경로에 쓰지 않아
 * 파일명 충돌과 경로 조작(../ 등)이 원천적으로 막힌다.
 *
 * <p>
 * 첨부와 다른 점은 <b>확장자를 흰 목록으로 제한</b>한다는 것이다. 첨부는 항상
 * octet-stream 으로 내려받게 해서 실행을 막지만, 프로필 사진은 &lt;img&gt; 로 화면에 바로
 * 걸리므로 브라우저가 내용을 해석한다. 특히 SVG 는 그 안에 스크립트를 넣을 수 있어 받지 않는다.
 */
@Component
public class ProfileImageStorage {

	/** 받아들이는 확장자. SVG 는 스크립트를 품을 수 있어 일부러 뺐다. */
	private static final Set<String> ALLOWED_EXTENSIONS = Set.of("jpg", "jpeg", "png", "webp", "gif");

	/**
	 * 한 장 최대 크기.
	 *
	 * <p>
	 * spring.servlet.multipart.max-file-size(10MB)가 먼저 걸리지만, 그쪽은 프레임워크 예외라
	 * 사용자에게 보여 줄 문장을 정할 수 없다. 프로필 사진에 10MB는 어차피 과하기도 해서 여기서
	 * 따로 자른다.
	 */
	private static final long MAX_BYTES = 5L * 1024 * 1024;

	/** 저장한 사진을 돌려주는 주소의 앞부분. DB에는 이 형태로 들어간다. */
	public static final String URL_PREFIX = "/api/v1/public/profile-images/";

	private final Path root;

	public ProfileImageStorage(@Value("${app.member.profile-image-dir}") String uploadDir) {
		this.root = Paths.get(uploadDir).toAbsolutePath().normalize();
	}

	/** 파일을 저장하고 화면에서 쓸 주소를 돌려준다. */
	public String store(MultipartFile file) {
		if (file == null || file.isEmpty()) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "이미지 파일을 선택해 주세요.");
		}
		if (file.getSize() > MAX_BYTES) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "이미지는 5MB 이하만 올릴 수 있습니다.");
		}

		String extension = extractExtension(file.getOriginalFilename());
		if (!ALLOWED_EXTENSIONS.contains(extension)) {
			throw new BusinessException(HttpStatus.BAD_REQUEST, "jpg, png, webp, gif 이미지만 올릴 수 있습니다.");
		}

		String storedName = UUID.randomUUID() + "." + extension;
		try {
			Files.createDirectories(root);
			file.transferTo(root.resolve(storedName));
		} catch (IOException e) {
			throw new BusinessException(HttpStatus.INTERNAL_SERVER_ERROR, "이미지 저장에 실패했습니다.");
		}
		return URL_PREFIX + storedName;
	}

	public Resource load(String storedName) {
		Path path = root.resolve(storedName).normalize();
		// storedName은 서버가 만든 UUID라 조작 여지가 없지만, 이중 방어로 루트 밖 접근을 막는다.
		if (!path.startsWith(root)) {
			throw new BusinessException(HttpStatus.NOT_FOUND, "이미지를 찾을 수 없습니다.");
		}
		try {
			Resource resource = new UrlResource(path.toUri());
			if (!resource.exists() || !resource.isReadable()) {
				throw new BusinessException(HttpStatus.NOT_FOUND, "이미지를 찾을 수 없습니다.");
			}
			return resource;
		} catch (IOException e) {
			throw new BusinessException(HttpStatus.NOT_FOUND, "이미지를 찾을 수 없습니다.");
		}
	}

	/**
	 * 예전 사진을 지운다. 사진을 바꿀 때마다 파일이 쌓이는 것을 막는다.
	 *
	 * <p>
	 * 지우기에 실패해도 예외를 던지지 않는다. 새 사진은 이미 저장됐고 DB도 새 주소를 가리키는데,
	 * 여기서 터지면 성공한 작업이 롤백된다. 남은 파일은 용량만 차지할 뿐 화면에는 영향이 없다.
	 *
	 * @param imageUrl
	 *            DB에 들어 있던 주소. 우리가 저장한 것이 아니면(예: 소셜 로그인이 준 외부 주소)
	 *            아무것도 하지 않는다.
	 */
	public void deleteQuietly(String imageUrl) {
		if (imageUrl == null || !imageUrl.startsWith(URL_PREFIX)) {
			return;
		}
		String storedName = imageUrl.substring(URL_PREFIX.length());
		try {
			Path path = root.resolve(storedName).normalize();
			if (path.startsWith(root)) {
				Files.deleteIfExists(path);
			}
		} catch (IOException | RuntimeException ignored) {
			// 위 설명 참고 — 실패해도 넘어간다
		}
	}

	/** 저장 파일명으로 응답 Content-Type을 정한다. 흰 목록을 통과한 확장자만 들어온다. */
	public static MediaType contentTypeOf(String storedName) {
		String extension = extractExtension(storedName);
		return switch (extension) {
			case "png" -> MediaType.IMAGE_PNG;
			case "gif" -> MediaType.IMAGE_GIF;
			case "webp" -> MediaType.parseMediaType("image/webp");
			default -> MediaType.IMAGE_JPEG;
		};
	}

	private static String extractExtension(String originalName) {
		if (originalName == null) {
			return "";
		}
		int dot = originalName.lastIndexOf('.');
		if (dot < 0 || dot == originalName.length() - 1) {
			return "";
		}
		return originalName.substring(dot + 1).toLowerCase(Locale.ROOT);
	}
}
