package com.protractor.backend.domain.board.dto;

import com.protractor.backend.domain.board.entity.PostAttachment;

public record AttachmentResponse(
        Long attachmentId,
        String originalName,
        long fileSize
) {
    public static AttachmentResponse from(PostAttachment attachment) {
        return new AttachmentResponse(
                attachment.getId(),
                attachment.getOriginalName(),
                attachment.getFileSize()
        );
    }
}
