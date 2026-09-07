package com.protractor.backend.domain.board.repository;

import com.protractor.backend.domain.board.dto.CategoryCountRow;
import com.protractor.backend.domain.board.dto.PostSummaryRow;
import com.protractor.backend.domain.board.entity.BoardCategory;
import com.protractor.backend.domain.board.entity.Post;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 게시글 조회·저장.
 *
 * <p>
 * 목록은 정렬 기준(최신/조회수/댓글)별로 쿼리를 따로 둔다 — JPQL의 order by는 동적으로 바꿀 수
 * 없어서다. 세 쿼리 모두 공지(NOTICE)가 목록 상단에 먼저 오도록 case 식을 정렬 맨 앞에 둔다
 * (공지가 아닌 카테고리만 조회할 때는 모든 행이 같은 값이라 영향이 없다).
 *
 * <p>
 * :authorId는 1:1 문의(INQUIRY)에서 "내 글만" 거를 때 쓰고, 그 외에는 null로 비활성화한다.
 * 작성자 닉네임은 members와 조인해 DTO로 바로 프로젝션한다(탈퇴 회원도 닉네임은 남는다).
 */
public interface PostRepository extends JpaRepository<Post, Long> {

    String LIST_SELECT = """
            select new com.protractor.backend.domain.board.dto.PostSummaryRow(
                p.id, p.category, p.title, m.nickname, p.createdAt, p.viewCount, p.commentCount,
                substring(p.content, 1, 120))
            """;

    String LIST_WHERE = """
            from Post p
            join Member m on m.id = p.authorMemberId
            where p.deletedAt is null
              and p.status = com.protractor.backend.domain.board.entity.PostStatus.PUBLISHED
              and p.category in :categories
              and (:authorId is null or p.authorMemberId = :authorId)
              and (:keyword is null
                   or p.title like concat('%', :keyword, '%')
                   or p.content like concat('%', :keyword, '%')
                   or m.nickname like concat('%', :keyword, '%'))
            """;

    String NOTICE_FIRST = """
            order by case when p.category = com.protractor.backend.domain.board.entity.BoardCategory.NOTICE
                          then 0 else 1 end,
            """;

    String LIST_COUNT = "select count(p) " + LIST_WHERE;

    @Query(value = LIST_SELECT + LIST_WHERE + NOTICE_FIRST + " p.createdAt desc, p.id desc",
            countQuery = LIST_COUNT)
    Page<PostSummaryRow> findPageOrderByLatest(
            @Param("categories") Collection<BoardCategory> categories,
            @Param("keyword") String keyword,
            @Param("authorId") Long authorId,
            Pageable pageable);

    @Query(value = LIST_SELECT + LIST_WHERE + NOTICE_FIRST + " p.viewCount desc, p.createdAt desc, p.id desc",
            countQuery = LIST_COUNT)
    Page<PostSummaryRow> findPageOrderByViews(
            @Param("categories") Collection<BoardCategory> categories,
            @Param("keyword") String keyword,
            @Param("authorId") Long authorId,
            Pageable pageable);

    @Query(value = LIST_SELECT + LIST_WHERE + NOTICE_FIRST + " p.commentCount desc, p.createdAt desc, p.id desc",
            countQuery = LIST_COUNT)
    Page<PostSummaryRow> findPageOrderByComments(
            @Param("categories") Collection<BoardCategory> categories,
            @Param("keyword") String keyword,
            @Param("authorId") Long authorId,
            Pageable pageable);

    /**
     * 말머리별 게시글 수. 커뮤니티 탭 옆 숫자에 쓴다.
     *
     * <p>
     * 목록 조회와 같은 조건(삭제되지 않고 공개된 글)만 센다 — 탭 숫자가 5인데 목록에 4개만
     * 나오면 어느 쪽이 맞는지 알 수 없다. 글이 하나도 없는 말머리는 결과에 없으므로 부르는 쪽이
     * 0으로 채운다.
     */
    @Query("""
            select new com.protractor.backend.domain.board.dto.CategoryCountRow(p.category, count(p))
            from Post p
            where p.deletedAt is null
              and p.status = com.protractor.backend.domain.board.entity.PostStatus.PUBLISHED
              and p.category in :categories
            group by p.category
            """)
    List<CategoryCountRow> countByCategory(@Param("categories") Collection<BoardCategory> categories);

    Optional<Post> findByIdAndDeletedAtIsNull(Long id);

    /**
     * 조회수 +1. 엔티티를 거치지 않는 벌크 update라 동시 조회에도 증가가 유실되지 않는다.
     * clearAutomatically로 1차 캐시를 비워, 이후 같은 트랜잭션의 조회가 옛 값을 보지 않게 한다.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Post p set p.viewCount = p.viewCount + 1 where p.id = :postId")
    void incrementViewCount(@Param("postId") Long postId);
}
