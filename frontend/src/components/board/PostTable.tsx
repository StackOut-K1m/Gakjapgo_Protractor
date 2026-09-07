import type { PostSummary } from '@/types/board';
import { BOARD_CATEGORY_LABEL } from '@/types/board';
import { formatBoardDate } from '@/lib/board/boardDate';

interface Props {
  posts: PostSummary[];
  /** 행 클릭(또는 Enter) 시 호출. 상세 페이지 이동에 쓴다. */
  onSelect: (post: PostSummary) => void;
}

/**
 * 표 모양의 게시글 목록. 지금은 문의함(SupportPage)이 쓴다 —
 * 커뮤니티는 카드 목록(PostCardList)으로 갈라졌다.
 *
 * <p>1:1 문의 행에는 답변 여부 배지와 자물쇠가 붙는다. 문의는 작성자 본인과 관리자만 볼 수
 * 있는 글이라 자물쇠는 조건 없이 붙는다 — 서버 규칙(BoardService.assertReadable)이 그렇다.
 */
function PostTable({ posts, onSelect }: Props) {
  return (
    <div className="post-table">
      <div className="table-head">
        <span>말머리</span>
        <span>제목</span>
        <span>작성자</span>
        <span>작성일</span>
        <span className="post-num">조회수</span>
        <span className="post-num">댓글</span>
      </div>
      {posts.map((post) => {
        const isInquiry = post.category === 'INQUIRY';
        // 문의에 달린 댓글은 곧 답변이다. 별도의 '처리 상태' 컬럼이 서버에 없어 이걸로 본다.
        const answered = post.commentCount > 0;
        return (
          <div
            key={post.postId}
            className={`table-row${post.category === 'NOTICE' ? ' row-notice' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(post)}
            onKeyDown={(e) => e.key === 'Enter' && onSelect(post)}
          >
            <span>
              <em className={`tag tag-${post.category.toLowerCase()}`}>
                {BOARD_CATEGORY_LABEL[post.category]}
              </em>
            </span>
            <span className="post-title-cell">
              {isInquiry && (
                <span className="lock-icon" title="작성자와 관리자만 볼 수 있어요">
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden>
                    <rect
                      x="4"
                      y="10"
                      width="16"
                      height="10"
                      rx="2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                    <path
                      d="M8 10V7a4 4 0 0 1 8 0v3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                  </svg>
                </span>
              )}
              <span className="post-title">{post.title}</span>
              {isInquiry && (
                <span className="answer-badge" data-answered={answered}>
                  {answered ? '답변완료' : '대기중'}
                </span>
              )}
            </span>
            <span className="post-author">{post.authorNickname}</span>
            <span className="post-date">{formatBoardDate(post.createdAt)}</span>
            <span className="post-num">{post.viewCount}</span>
            <span className="post-num">{post.commentCount}</span>
          </div>
        );
      })}
    </div>
  );
}

export default PostTable;
