package com.protractor.backend.domain.board.dto;

import org.springframework.core.io.Resource;

/** 첨부 다운로드에 필요한 파일 리소스 + 메타데이터 묶음(컨트롤러가 헤더를 만드는 데 쓴다). */
public record AttachmentDownload(
        Resource resource,
        String originalName,
        String contentType,
        long fileSize
) {
}
