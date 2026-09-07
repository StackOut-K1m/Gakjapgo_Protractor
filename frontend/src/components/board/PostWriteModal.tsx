import { useRef, useState } from 'react';

import { createPost, updatePost, uploadPostAttachments } from '@/api/boardApi';
import { getApiErrorMessage } from '@/api/client';
import { ADMIN_ONLY_BOARDS } from '@/lib/board/boardPaths';
import { useAuthStore } from '@/stores/useAuthStore';
import type { BoardCategory, PostDetail } from '@/types/board';

// 글쓰기 모달의 "게시판 선택" 드롭다운 표기 (말머리 축약형이 아닌 전체 이름)
const FULL_LABEL: Record<BoardCategory, string> = {
  NOTICE: '공지사항',
  FREE: '자유게시판',
  QNA: '질문하기',
  SHARE: '자료공유',
  EVENT: '이벤트',
  INQUIRY: '1:1 문의',
};

// 커뮤니티 글쓰기에서 고를 수 있는 게시판(탭 순서와 같게 둔다).
// 공지사항·이벤트는 관리자만 쓸 수 있어 일반 회원에게는 목록에서 빠진다(서버도 403으로 막는다).
const COMMUNITY_OPTIONS: BoardCategory[] = ['NOTICE', 'FREE', 'QNA', 'SHARE', 'EVENT'];

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (서버 제한과 동일)

/**
 * 첨부 기능을 열어 둘지.
 *
 * 2026-08-03 에 열었다. 잠가 둔 이유였던 두 가지(post_attachments 테이블, 업로드 경로의
 * bind mount)가 배포 환경에서 모두 갖춰졌다.
 *
 * 서버에도 짝이 되는 스위치가 있다 — `app.board.attachments-enabled` 이고 기본값이
 * false 라 `BOARD_ATTACHMENTS_ENABLED=true` 를 넣어야 켜진다. 꺼진 서버에 올리면
 * 업로드만 503 으로 막히고 글은 그대로 등록된다(아래 재시도 흐름이 그 경우를 받는다).
 *
 * 로컬에서 첨부가 500 으로 실패하면 대개 DB 볼륨이 오래된 경우다. 마이그레이션은 볼륨을
 * 처음 만들 때만 돌아서, 그 전에 만든 볼륨에는 post_attachments 테이블이 없다.
 */
const ATTACHMENTS_ENABLED = true;

interface Props {
  onClose: () => void;
  /**
   * 저장 성공 시 목록·상세를 새로고침한다.
   *
   * 어느 게시판에 썼는지 같이 넘긴다. 모달 안에서 게시판을 바꿀 수 있어서, 부르는 쪽이
   * "내가 보고 있던 탭"만 알고 있으면 방금 쓴 글이 안 보이는 곳으로 데려갈 수 있다.
   */
  onCreated: (category: BoardCategory) => void;
  /** 이벤트·1:1 문의 페이지처럼 게시판이 정해진 화면에서 넘긴다(선택 불가). */
  fixedCategory?: BoardCategory;
  /** 있으면 수정 모드로 동작한다(첨부 변경은 아직 미지원). */
  editPost?: PostDetail;
}

function PostWriteModal({ onClose, onCreated, fixedCategory, editPost }: Props) {
  const isAdmin = useAuthStore((s) => s.member?.role) === 'ADMIN';
  const isEdit = Boolean(editPost);

  // ''는 아직 게시판을 고르지 않은 상태(시안의 "선택해주세요")
  const [category, setCategory] = useState<BoardCategory | ''>(
    fixedCategory ?? editPost?.category ?? '',
  );
  const [title, setTitle] = useState(editPost?.title ?? '');
  const [content, setContent] = useState(editPost?.content ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * 글은 등록됐는데 첨부만 실패한 상태에서 그 글의 번호.
   *
   * 이 값이 있으면 등록 버튼이 "첨부 다시 시도"가 된다. 글을 또 만들면 같은 내용이 두 벌
   * 쌓이므로, 재시도는 업로드만 다시 한다.
   */
  const [createdPostId, setCreatedPostId] = useState<number | null>(null);
  /** 글이 이미 등록된 뒤에는 내용을 고쳐도 반영되지 않는다. 입력을 잠가 오해를 막는다 */
  const attachRetryMode = createdPostId !== null;

  const options = fixedCategory
    ? [fixedCategory]
    : COMMUNITY_OPTIONS.filter((c) => !ADMIN_ONLY_BOARDS.includes(c) || isAdmin);

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files, ...Array.from(picked)];
    if (next.length > MAX_FILES) {
      setError(`첨부파일은 최대 ${MAX_FILES}개까지 올릴 수 있어요.`);
      return;
    }
    const tooBig = next.find((f) => f.size > MAX_FILE_SIZE);
    if (tooBig) {
      setError(`"${tooBig.name}" 파일이 10MB를 넘어요.`);
      return;
    }
    setError('');
    setFiles(next);
    // 같은 파일을 지웠다 다시 골라도 change 이벤트가 오도록 입력값을 비운다.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!category) {
      setError('게시판을 선택해주세요.');
      return;
    }
    if (!title.trim()) {
      setError('제목을 입력해주세요.');
      return;
    }
    if (!content.trim()) {
      setError('내용을 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (isEdit && editPost) {
        await updatePost(editPost.postId, {
          category: category !== editPost.category ? category : undefined,
          title: title.trim(),
          content: content.trim(),
        });
      } else {
        // 첨부만 실패해 다시 시도하는 중이면 글을 또 만들지 않는다.
        const postId =
          createdPostId ??
          (await createPost({ category, title: title.trim(), content: content.trim() })).postId;

        if (files.length > 0) {
          try {
            await uploadPostAttachments(postId, files);
          } catch (e) {
            // 글 자체는 등록된 상태다. 목록은 갱신해 두고, 모달은 열어 둔 채 재시도를 받는다.
            // 상세 화면에는 첨부를 올리는 자리가 없어서, 여기서 다시 시도하지 못하면
            // 파일을 붙일 방법이 아예 없다.
            setCreatedPostId(postId);
            onCreated(category);
            setError(
              getApiErrorMessage(
                e,
                '글은 등록됐지만 파일 첨부에 실패했습니다. 아래 "첨부 다시 시도"를 눌러주세요.',
              ),
            );
            return;
          }
        }
      }
      onCreated(category);
      onClose();
    } catch (e) {
      setError(getApiErrorMessage(e, isEdit ? '게시글 수정에 실패했습니다.' : '게시글 작성에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label={isEdit ? '글 수정' : '글쓰기'}>
      <div className="modal-card">
        <div className="modal-head">
          <h2>{isEdit ? '글 수정' : '글쓰기'}</h2>
          <button type="button" className="modal-close" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>

        {/*
          새 글에서는 게시판을 보여주지도, 고르게 하지도 않는다. 글쓰기는 언제나 보고 있던
          게시판 화면에서 시작하므로 부르는 쪽이 이미 답을 알고 있다. 같은 걸 또 고르게 하면
          다른 곳에 잘못 올릴 여지만 생긴다.

          수정은 예외다. 이미 쓴 글을 다른 게시판으로 옮기는 유일한 경로라 남겨 둔다.
        */}
        {isEdit && !fixedCategory && (
          <label>
            게시판 선택
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BoardCategory)}
            >
              <option value="" disabled>
                선택해주세요
              </option>
              {options.map((value) => (
                <option key={value} value={value}>
                  {FULL_LABEL[value]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          제목
          <input
            value={title}
            disabled={attachRetryMode}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목을 입력하세요"
            maxLength={200}
          />
        </label>

        <label>
          내용
          <textarea
            value={content}
            disabled={attachRetryMode}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용을 입력하세요"
            rows={8}
          />
        </label>

        {!isEdit && files.length > 0 && (
          <ul className="attach-list">
            {files.map((file, idx) => (
              <li key={`${file.name}-${idx}`} className="attach-chip">
                <span className="attach-name">📎 {file.name}</span>
                <button
                  type="button"
                  aria-label={`${file.name} 첨부 제거`}
                  onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="error">{error}</p>}

        {/* 닫으면 첨부 없는 글로 남는다. 되돌릴 방법이 없으니 닫기 전에 알려 준다 */}
        {attachRetryMode && (
          <p className="muted">
            글은 이미 등록되어 제목·내용은 더 이상 바꿀 수 없어요. 첨부를 빼고
            마치려면 파일을 모두 지운 뒤 눌러주세요.
          </p>
        )}

        <div className="modal-actions modal-actions-split">
          {!isEdit ? (
            <>
              <button
                type="button"
                className="attach-btn"
                disabled={submitting || !ATTACHMENTS_ENABLED}
                // 왜 눌리지 않는지 알려 준다. 이유 없이 회색인 버튼은 고장으로 읽힌다.
                title={
                  ATTACHMENTS_ENABLED
                    ? undefined
                    : '파일 첨부는 준비 중이에요. 글은 그대로 등록할 수 있어요.'
                }
                onClick={() => fileInputRef.current?.click()}
              >
                📎 파일 첨부
              </button>
              {/* 잠긴 동안에는 파일 선택창 자체를 두지 않는다. 버튼만 막고 남겨 두면
                  키보드나 스크립트로 열려 다시 실패 경로로 들어간다. */}
              {ATTACHMENTS_ENABLED && (
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => addFiles(e.target.files)}
                />
              )}
            </>
          ) : (
            <span /> // 수정 모드는 첨부 변경 미지원 — 자리만 지켜 등록 버튼을 오른쪽에 둔다
          )}
          <button type="button" className="primary" disabled={submitting} onClick={handleSubmit}>
            {submitting
              ? '등록 중…'
              : attachRetryMode
                ? files.length > 0
                  ? '첨부 다시 시도'
                  : '첨부 없이 마치기'
                : isEdit
                  ? '저장'
                  : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PostWriteModal;
