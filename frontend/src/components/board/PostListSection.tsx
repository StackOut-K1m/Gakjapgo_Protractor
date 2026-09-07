// src/components/board/PostListSection.tsx
//
// 게시글 목록 + 그 주변 상태(불러오는 중·오류·비어 있음)를 한 덩어리로 묶는다.
//
// 커뮤니티·이벤트·1:1 문의가 같은 목록을 쓰는데 이 네 갈래 분기를 각자 들고 있었다. 세 벌이라
// 한 곳만 고치면 나머지 둘이 어긋난다 — 실제로 "불러오는 중" 처리를 고칠 때 세 파일을 똑같이
// 세 번 고쳐야 했다.
import PostCardList from '@/components/board/PostCardList';
import PostTable from '@/components/board/PostTable';
import type { PostSummary } from '@/types/board';

interface PostListSectionProps {
  posts: PostSummary[] | null;
  loading: boolean;
  error: string | null;
  /** 목록이 비었을 때 보여 줄 문구. 화면마다 다르다(게시글/이벤트/문의). */
  emptyText: string;
  /**
   * 목록 모양. 커뮤니티는 카드(본문 미리보기가 필요하다), 문의함은 표(처리 상태를 훑는다).
   * 기본은 표 — 이 값을 몰랐던 기존 호출부가 그대로 동작해야 한다.
   */
  variant?: 'table' | 'cards';
  onSelect: (post: PostSummary) => void;
}

export default function PostListSection({
  posts,
  loading,
  error,
  emptyText,
  variant = 'table',
  onSelect,
}: PostListSectionProps) {
  // 보여 줄 목록이 아직 하나도 없을 때만 "불러오는 중"을 띄운다. 탭·정렬·페이지를 바꿀 때마다
  // 목록을 지우고 문구로 바꾸면 같은 화면을 처음 여는 것처럼 보이고, 높이가 줄었다 늘면서
  // 아래 내용이 튄다. 다시 불러오는 동안에는 이전 목록을 흐리게만 둔다.
  if (loading && !posts) {
    return <p className="muted board-msg">불러오는 중…</p>;
  }
  if (error) {
    return <p className="error board-msg">{error}</p>;
  }
  if (!posts || posts.length === 0) {
    return <p className="muted board-msg">{emptyText}</p>;
  }
  return (
    <div className="board-list" data-loading={loading || undefined}>
      {variant === 'cards' ? (
        <PostCardList posts={posts} onSelect={onSelect} />
      ) : (
        <PostTable posts={posts} onSelect={onSelect} />
      )}
    </div>
  );
}
