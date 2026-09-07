import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import {
  createComment,
  deleteComment,
  deletePost,
  downloadPostAttachment,
  getPost,
} from '@/api/boardApi';
import { getApiErrorMessage } from '@/api/client';
import PostWriteModal from '@/components/board/PostWriteModal';
import { useAsync } from '@/hooks/useAsync';
import { useAuthStore, useIsLoggedIn } from '@/stores/useAuthStore';
import type { AttachmentItem } from '@/types/board';
import { BOARD_CATEGORY_LABEL } from '@/types/board';

import { formatBoardDateTime } from '@/lib/board/boardDate';
import { listPathOfCategory } from '@/lib/board/boardPaths';

import './CommunityPage.css';
import './PostDetailPage.css';

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function PostDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const id = Number(postId);
  const navigate = useNavigate();
  const location = useLocation();
  const isLoggedIn = useIsLoggedIn();
  const isAdmin = useAuthStore((s) => s.member?.role) === 'ADMIN';

  const [refreshKey, setRefreshKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data, loading, error } = useAsync(() => getPost(id), [id, refreshKey]);

  /**
   * "목록으로" 눌렀을 때 돌아갈 곳.
   *
   * 목록에서 글을 열 때 그 화면의 주소를 통째로 넘겨받는다(정렬·페이지·검색어 포함). 그래야
   * 3페이지에서 열어 본 사람이 3페이지로 돌아온다. 카테고리만 보고 돌아가면 보던 조건이
   * 매번 초기화되고, 예전에는 자유게시판에서 연 글도 전체 게시글로 떨어졌다.
   *
   * 주소를 직접 치거나 링크로 들어오면 넘겨받은 값이 없다. 그때는 글이 속한 게시판으로 간다.
   */
  const cameFrom = (location.state as { from?: string } | null)?.from ?? null;
  const backTo = cameFrom ?? (data ? listPathOfCategory(data.category) : '/community');

  const refresh = () => setRefreshKey((k) => k + 1);

  const handleDeletePost = async () => {
    if (!data) return;
    if (!window.confirm('게시글을 삭제할까요? 삭제한 글은 목록에서 사라집니다.')) return;
    try {
      await deletePost(data.postId);
      navigate(listPathOfCategory(data.category), { replace: true });
    } catch (e) {
      setActionError(getApiErrorMessage(e, '게시글 삭제에 실패했습니다.'));
    }
  };

  const handleDownload = async (attachment: AttachmentItem) => {
    try {
      const { blob, filename } = await downloadPostAttachment(
        attachment.attachmentId,
        attachment.originalName,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setActionError(getApiErrorMessage(e, '첨부파일 다운로드에 실패했습니다.'));
    }
  };

  const handleCreateComment = async () => {
    const content = commentInput.trim();
    if (!content || !data) return;
    setCommentSubmitting(true);
    setActionError('');
    try {
      await createComment(data.postId, content);
      setCommentInput('');
      refresh();
    } catch (e) {
      setActionError(getApiErrorMessage(e, '댓글 등록에 실패했습니다.'));
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!window.confirm('댓글을 삭제할까요?')) return;
    try {
      await deleteComment(commentId);
      refresh();
    } catch (e) {
      setActionError(getApiErrorMessage(e, '댓글 삭제에 실패했습니다.'));
    }
  };

  return (
    <div className="community post-detail">
      {loading && <p className="muted board-msg">불러오는 중…</p>}
      {error && (
        <div className="board-msg">
          <p className="error">{error}</p>
          <button type="button" onClick={() => navigate(backTo)}>
            ← 목록으로
          </button>
        </div>
      )}

      {data && (
        <>
          <button
            type="button"
            className="back-btn"
            onClick={() => navigate(backTo)}
          >
            ← 목록으로
          </button>

          <article className="detail-card">
            <header className="detail-head">
              <div className="detail-title-row">
                <em className={`tag tag-${data.category.toLowerCase()}`}>
                  {BOARD_CATEGORY_LABEL[data.category]}
                </em>
                <h1>{data.title}</h1>
              </div>
              <div className="detail-meta">
                <span className="post-author">{data.authorNickname}</span>
                <span className="post-date">{formatBoardDateTime(data.createdAt)}</span>
                <span className="post-date">조회 {data.viewCount}</span>
                {(data.mine || isAdmin) && (
                  <span className="detail-actions">
                    {data.mine && (
                      <button type="button" onClick={() => setEditOpen(true)}>
                        수정
                      </button>
                    )}
                    <button type="button" className="danger" onClick={handleDeletePost}>
                      삭제
                    </button>
                  </span>
                )}
              </div>
            </header>

            <div className="detail-content">{data.content}</div>

            {data.attachments.length > 0 && (
              <section className="detail-attachments" aria-label="첨부파일">
                {data.attachments.map((attachment) => (
                  <button
                    key={attachment.attachmentId}
                    type="button"
                    className="attach-download"
                    onClick={() => handleDownload(attachment)}
                  >
                    📎 {attachment.originalName}
                    <span className="attach-size">({formatBytes(attachment.fileSize)})</span>
                  </button>
                ))}
              </section>
            )}
          </article>

          <section className="comment-section" aria-label="댓글">
            <h2>댓글 {data.commentCount}</h2>

            {data.comments.length === 0 && (
              <p className="muted comment-empty">
                {data.category === 'INQUIRY'
                  ? '아직 답변이 등록되지 않았어요.'
                  : '첫 댓글을 남겨보세요.'}
              </p>
            )}
            <ul className="comment-list">
              {data.comments.map((comment) => (
                <li key={comment.commentId} className="comment-item">
                  <div className="comment-head">
                    <span className="comment-author">{comment.authorNickname}</span>
                    <span className="post-date">{formatBoardDateTime(comment.createdAt)}</span>
                    {(comment.mine || isAdmin) && (
                      <button
                        type="button"
                        className="comment-delete"
                        onClick={() => handleDeleteComment(comment.commentId)}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <p className="comment-content">{comment.content}</p>
                </li>
              ))}
            </ul>

            {isLoggedIn ? (
              <div className="comment-write">
                <textarea
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="댓글을 입력하세요"
                  rows={3}
                  maxLength={1000}
                />
                <button
                  type="button"
                  className="primary"
                  disabled={commentSubmitting || !commentInput.trim()}
                  onClick={handleCreateComment}
                >
                  {commentSubmitting ? '등록 중…' : '등록'}
                </button>
              </div>
            ) : (
              <p className="muted comment-login">
                댓글을 쓰려면 <Link to="/login">로그인</Link>이 필요해요.
              </p>
            )}

            {actionError && <p className="error">{actionError}</p>}
          </section>

          {editOpen && (
            <PostWriteModal
              editPost={data}
              fixedCategory={
                data.category === 'INQUIRY' || data.category === 'EVENT'
                  ? data.category
                  : undefined
              }
              onClose={() => setEditOpen(false)}
              onCreated={refresh}
            />
          )}
        </>
      )}
    </div>
  );
}

export default PostDetailPage;
