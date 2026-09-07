import { BOARD_CATEGORY_LABEL, type PostSummary } from '@/types/board';
import { formatBoardDate } from '@/lib/board/boardDate';

interface Props {
  posts: PostSummary[];
  onSelect: (post: PostSummary) => void;
}

/**
 * 커뮤니티 목록의 카드형 행.
 *
 * 문의함(SupportPage)이 쓰는 표(PostTable)와 나눠 둔 이유: 커뮤니티는 훑어보며 읽을 글을
 * 고르는 곳이라 본문 미리보기가 있어야 하고, 문의함은 내 글의 처리 상태를 확인하는 곳이라
 * 한 줄에 여러 칸이 나란한 표가 맞는다. 한 컴포넌트에 두 모양을 담으면 분기가 화면 수만큼 늘어난다.
 */
export default function PostCardList({ posts, onSelect }: Props) {
  return (
    <div className="post-cards">
      {posts.map((post) => (
        <article
          key={post.postId}
          className="post-card"
          data-cat={post.category}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(post)}
          onKeyDown={(e) => e.key === 'Enter' && onSelect(post)}
        >
          <div className="post-card-main">
            <div className="post-card-badges">
              <span className="post-card-cat">
                {BOARD_CATEGORY_LABEL[post.category]}
              </span>
              {/* 공지는 서버가 목록 맨 위로 올려 준다. 그 사실을 화면에도 적어 둔다 */}
              {post.category === 'NOTICE' && (
                <span className="post-card-pin">상단 고정</span>
              )}
            </div>

            <h3 className="post-card-title">{post.title}</h3>
            {/* 서버가 본문 앞 120자를 잘라 준다. 없는 글도 있어 빈 줄을 만들지 않는다 */}
            {post.excerpt && (
              <p className="post-card-excerpt">{post.excerpt}</p>
            )}

            <div className="post-card-meta">
              <span className="post-card-author">
                <span className="post-card-avatar" aria-hidden>
                  {post.authorNickname.slice(0, 1)}
                </span>
                {post.authorNickname}
              </span>
              <span>{formatBoardDate(post.createdAt)}</span>
              <span className="post-card-views">
                조회 {post.viewCount.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="post-card-comments">
            <span className="post-card-comment-count" data-hot={post.commentCount >= 15}>
              {post.commentCount}
            </span>
            <span className="post-card-comment-label">댓글</span>
          </div>
        </article>
      ))}
    </div>
  );
}
