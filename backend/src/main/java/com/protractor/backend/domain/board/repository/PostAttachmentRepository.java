package com.protractor.backend.domain.board.repository;

import com.protractor.backend.domain.board.entity.PostAttachment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PostAttachmentRepository extends JpaRepository<PostAttachment, Long> {

    List<PostAttachment> findByPostIdOrderByIdAsc(Long postId);

    long countByPostId(Long postId);
}
