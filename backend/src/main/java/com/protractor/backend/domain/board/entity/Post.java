package com.protractor.backend.domain.board.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Formula;

/**
 * 커뮤니티 게시글(공지·자유·질문·자료공유·이벤트·1:1 문의 공용).
 *
 * <p>
 * 삭제는 deleted_at을 채우는 소프트 삭제다. 작성자 회원이 탈퇴해도 행은 남고
 * 닉네임은 표시용으로 유지된다(Member.withdraw 참고).
 */
@Entity
@Table(name = "posts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "post_id")
    private Long id;

    @Column(name = "author_member_id", nullable = false)
    private Long authorMemberId;

    @Enumerated(EnumType.STRING)
    @Column(name = "category", length = 50)
    private BoardCategory category;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private PostStatus status;

    @Column(name = "view_count", nullable = false)
    private int viewCount;

    /**
     * 삭제되지 않은 댓글 수. 별도 컬럼 없이 조회 시점에 서브쿼리로 계산한다
     * (Hibernate가 바깥 post_id에 posts 별칭을 붙여 준다). 목록 "댓글순" 정렬도 이 값을 쓴다.
     */
    @Formula("(select count(*) from comments c where c.post_id = post_id and c.deleted_at is null)")
    private int commentCount;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Builder
    private Post(Long authorMemberId, BoardCategory category, String title, String content) {
        this.authorMemberId = authorMemberId;
        this.category = category;
        this.title = title;
        this.content = content;
        this.status = PostStatus.PUBLISHED;
        this.viewCount = 0;
    }

    public boolean isOwnedBy(Long memberId) {
        return this.authorMemberId.equals(memberId);
    }

    public boolean isVisible() {
        return this.deletedAt == null && this.status == PostStatus.PUBLISHED;
    }

    public void changeCategory(BoardCategory category) {
        this.category = category;
    }

    public void changeTitle(String title) {
        this.title = title;
    }

    public void changeContent(String content) {
        this.content = content;
    }

    public void softDelete() {
        this.deletedAt = LocalDateTime.now();
    }

    @PrePersist
    private void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    private void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
