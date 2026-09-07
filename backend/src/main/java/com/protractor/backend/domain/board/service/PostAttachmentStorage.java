package com.protractor.backend.domain.board.service;

import com.protractor.backend.global.exception.BusinessException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * 게시글 첨부파일의 실제 저장/읽기. 리포트(ReportStorage)처럼 로컬 디렉터리에 보관한다.
 *
 * <p>
 * 저장 파일명은 서버가 만든 UUID(+확장자)만 쓴다. 사용자가 보낸 원본 이름을 경로에 쓰지 않아
 * 파일명 충돌과 경로 조작(../ 등)이 원천적으로 막힌다. 원본 이름은 DB에만 남긴다.
 */
@Component
public class PostAttachmentStorage {

    /** 확장자는 영숫자 1~10자만 인정한다. 그 외(빈 값 포함)는 확장자 없이 저장한다. */
    private static final Pattern SAFE_EXTENSION = Pattern.compile("[a-zA-Z0-9]{1,10}");

    private final Path root;

    public PostAttachmentStorage(@Value("${app.board.upload-dir}") String uploadDir) {
        this.root = Paths.get(uploadDir).toAbsolutePath().normalize();
    }

    /** 파일을 저장하고 저장 파일명(UUID.확장자)을 돌려준다. */
    public String store(MultipartFile file) {
        String extension = extractExtension(file.getOriginalFilename());
        String storedName = UUID.randomUUID() + (extension.isEmpty() ? "" : "." + extension);
        try {
            Files.createDirectories(root);
            file.transferTo(root.resolve(storedName));
        } catch (IOException e) {
            throw new BusinessException(HttpStatus.INTERNAL_SERVER_ERROR, "파일 저장에 실패했습니다.");
        }
        return storedName;
    }

    public Resource load(String storedName) {
        Path path = root.resolve(storedName).normalize();
        // storedName은 서버가 만든 UUID라 조작 여지가 없지만, 이중 방어로 루트 밖 접근을 막는다.
        if (!path.startsWith(root)) {
            throw new BusinessException(HttpStatus.NOT_FOUND, "첨부파일을 찾을 수 없습니다.");
        }
        try {
            Resource resource = new UrlResource(path.toUri());
            if (!resource.exists() || !resource.isReadable()) {
                throw new BusinessException(HttpStatus.NOT_FOUND, "첨부파일을 찾을 수 없습니다.");
            }
            return resource;
        } catch (IOException e) {
            throw new BusinessException(HttpStatus.NOT_FOUND, "첨부파일을 찾을 수 없습니다.");
        }
    }

    private String extractExtension(String originalName) {
        if (originalName == null) {
            return "";
        }
        int dot = originalName.lastIndexOf('.');
        if (dot < 0 || dot == originalName.length() - 1) {
            return "";
        }
        String extension = originalName.substring(dot + 1);
        return SAFE_EXTENSION.matcher(extension).matches() ? extension.toLowerCase() : "";
    }
}
