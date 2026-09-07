package com.protractor.backend.domain.board.repository;

import com.protractor.backend.domain.board.dto.CommentRow;
import com.protractor.backend.domain.board.entity.Comment;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CommentRepository extends JpaRepository<Comment, Long> {

    /** 게시글의 살아있는 댓글을 작성 순서대로, 작성자 닉네임과 함께 가져온다. */
    @Query("""
            select new com.protractor.backend.domain.board.dto.CommentRow(
                c.id, c.authorMemberId, m.nickname, c.content, c.createdAt)
            from Comment c
            join Member m on m.id = c.authorMemberId
            where c.postId = :postId and c.deletedAt is null
            order by c.createdAt asc, c.id asc
            """)
    List<CommentRow> findRowsByPostId(@Param("postId") Long postId);

    Optional<Comment> findByIdAndDeletedAtIsNull(Long id);
}
